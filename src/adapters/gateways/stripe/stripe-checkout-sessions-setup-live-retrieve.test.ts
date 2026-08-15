import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import {
  createStripeTrialPaymentMethodSetupSession,
  TRIAL_SETUP_SESSION_REPLAY_TRAVERSAL_LIMIT,
} from './stripe-checkout-sessions';
import { isValidStripeConsentStateSignature } from './stripe-consent-state';
import { FakeStripeCheckoutClient } from './test-helpers/fake-stripe-checkout-client';

const INITIAL_NOW = new Date('2026-08-15T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const CONSENT_STATE_SECRET = 'dedicated-consent-state-secret-32-bytes';

const setupInput = {
  userId: '8e27561f-f383-4fe9-b3f9-738b44adf8fe',
  externalCustomerId: 'cus_test',
  externalSubscriptionId: 'sub_test',
  plan: 'monthly' as const,
  amountCents: 2900,
  currency: 'usd' as const,
  frequency: 'month' as const,
  trialEndsAt: new Date('2026-08-22T12:00:00.000Z'),
  disclosureSnapshot: 'Test trial renewal disclosure.',
  disclosureVersion: '2026-08-05',
  termsVersion: '2026-08-05',
  termsHash: 'test-terms-hash',
  cancellationMethod: 'Billing page in the app or support@addictionboards.com',
  successUrl:
    'https://app.example.com/app/billing?trial_payment_method=success&session_id={CHECKOUT_SESSION_ID}',
  cancelUrl: 'https://app.example.com/app/billing?trial_payment_method=cancel',
};

async function createSetupSession(stripe: FakeStripeCheckoutClient) {
  return createStripeTrialPaymentMethodSetupSession({
    stripe,
    input: setupInput,
    logger: new FakeLogger(),
    stateSecret: CONSENT_STATE_SECRET,
  });
}

async function buildCompletedSetupChain(
  stripe: FakeStripeCheckoutClient,
  count: number,
): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    const session = await createSetupSession(stripe);
    stripe.markComplete(session.sessionId);
  }
}

describe('createStripeTrialPaymentMethodSetupSession live retrieval', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(INITIAL_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the measured setup replay traversal limit', () => {
    expect(TRIAL_SETUP_SESSION_REPLAY_TRAVERSAL_LIMIT).toBe(10);
  });

  it('replaces a saved open response when the live Session is complete', async () => {
    const stripe = new FakeStripeCheckoutClient();
    const first = await createSetupSession(stripe);
    stripe.markComplete(first.sessionId);

    const replacement = await createSetupSession(stripe);

    expect(replacement.sessionId).not.toBe(first.sessionId);
    await expect(
      stripe.checkout.sessions.retrieve(replacement.sessionId),
    ).resolves.toMatchObject({ status: 'open', url: replacement.url });
  });

  it('replaces a saved open response when the live Session expires early', async () => {
    const stripe = new FakeStripeCheckoutClient();
    const first = await createSetupSession(stripe);
    stripe.markExpired(first.sessionId);

    const replacement = await createSetupSession(stripe);

    expect(replacement.sessionId).not.toBe(first.sessionId);
    await expect(
      stripe.checkout.sessions.retrieve(replacement.sessionId),
    ).resolves.toMatchObject({ status: 'open', url: replacement.url });
  });

  it('deduplicates a replay while the live Session remains open', async () => {
    const stripe = new FakeStripeCheckoutClient();
    const first = await createSetupSession(stripe);

    await expect(createSetupSession(stripe)).resolves.toEqual(first);
  });

  it('replaces a naturally expired saved response using its expires_at', async () => {
    const stripe = new FakeStripeCheckoutClient();
    const first = await createSetupSession(stripe);
    vi.setSystemTime(new Date(INITIAL_NOW.getTime() + DAY_MS + 1_000));

    const replacement = await createSetupSession(stripe);

    expect(replacement.sessionId).not.toBe(first.sessionId);
    await expect(
      stripe.checkout.sessions.retrieve(replacement.sessionId),
    ).resolves.toMatchObject({ status: 'open', url: replacement.url });
  });

  it('retrieves every retained primary and recovery response through the exact success boundary', async () => {
    const stripe = new FakeStripeCheckoutClient();
    await buildCompletedSetupChain(
      stripe,
      TRIAL_SETUP_SESSION_REPLAY_TRAVERSAL_LIMIT,
    );
    const createCallCountBeforeBoundary = stripe.createCalls.length;
    const retrieveCallCountBeforeBoundary = stripe.retrieveCalls.length;

    const fresh = await createSetupSession(stripe);

    expect(stripe.createCalls).toHaveLength(
      createCallCountBeforeBoundary +
        TRIAL_SETUP_SESSION_REPLAY_TRAVERSAL_LIMIT +
        1,
    );
    expect(stripe.retrieveCalls).toHaveLength(
      retrieveCallCountBeforeBoundary +
        TRIAL_SETUP_SESSION_REPLAY_TRAVERSAL_LIMIT +
        1,
    );
    await expect(
      stripe.checkout.sessions.retrieve(fresh.sessionId),
    ).resolves.toMatchObject({ status: 'open', url: fresh.url });
  });

  it('throws after primary plus L recoveries are terminal without creating recovery L + 1', async () => {
    const stripe = new FakeStripeCheckoutClient();
    await buildCompletedSetupChain(
      stripe,
      TRIAL_SETUP_SESSION_REPLAY_TRAVERSAL_LIMIT + 1,
    );
    const createCallCountBeforeExhaustion = stripe.createCalls.length;

    await expect(createSetupSession(stripe)).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
      message: 'Stripe Checkout Session is expired or inactive',
    });

    const exhaustedWalkCalls = stripe.createCalls.slice(
      createCallCountBeforeExhaustion,
    );
    expect(exhaustedWalkCalls).toHaveLength(
      TRIAL_SETUP_SESSION_REPLAY_TRAVERSAL_LIMIT + 1,
    );
    expect(
      exhaustedWalkCalls.some(({ options }) =>
        options?.idempotencyKey?.includes(
          `:attempt:${TRIAL_SETUP_SESSION_REPLAY_TRAVERSAL_LIMIT + 1}:`,
        ),
      ),
    ).toBe(false);
  });

  it('preserves signed consent metadata on primary and recovery creates', async () => {
    const stripe = new FakeStripeCheckoutClient();
    const first = await createSetupSession(stripe);
    stripe.markComplete(first.sessionId);

    await createSetupSession(stripe);

    expect(stripe.createCalls).toHaveLength(3);
    const firstParams = stripe.createCalls[0]?.params;
    for (const { params } of stripe.createCalls) {
      expect(params).toEqual(firstParams);
      const metadata = params.metadata;
      if (!metadata) throw new Error('Expected signed setup metadata');
      const { consent_state_signature: signature, ...signedMetadata } =
        metadata;
      expect(signature).toMatch(/^[a-f0-9]{64}$/);
      expect(
        isValidStripeConsentStateSignature(
          signedMetadata,
          signature ?? '',
          CONSENT_STATE_SECRET,
        ),
      ).toBe(true);
    }
  });

  it('fails closed when live retrieval exhausts its retry policy', async () => {
    const stripe = new FakeStripeCheckoutClient();
    const retrieveError = Object.assign(
      new Error('Stripe retrieve timed out'),
      {
        code: 'ETIMEDOUT',
      },
    );
    stripe.setRetrieveOverride(async () => {
      throw retrieveError;
    });

    const result = createSetupSession(stripe);
    const rejection = expect(result).rejects.toBe(retrieveError);
    await vi.runAllTimersAsync();

    await rejection;
    expect(stripe.retrieveCalls).toHaveLength(3);
  });

  it('fails closed when live retrieval returns a different Session id', async () => {
    const stripe = new FakeStripeCheckoutClient();
    stripe.setRetrieveOverride((session) => ({
      ...session,
      id: `${session.id}_mismatch`,
    }));

    await expect(createSetupSession(stripe)).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
      message:
        'Stripe Checkout Session live retrieval returned a mismatched id',
    });
  });

  it('fails closed when the live Session status is absent', async () => {
    const stripe = new FakeStripeCheckoutClient();
    stripe.setRetrieveOverride(({ status: _status, ...session }) => session);

    await expect(createSetupSession(stripe)).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
      message: 'Stripe Checkout Session live status is missing',
    });
  });
});
