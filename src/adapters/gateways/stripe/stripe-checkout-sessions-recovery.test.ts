import { describe, expect, it } from 'vitest';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { createTestRenewalTerms } from '@/src/application/test-helpers/renewal-terms';
import {
  createStripeCheckoutSession,
  SUBSCRIPTION_CHECKOUT_REPLAY_TRAVERSAL_LIMIT,
} from './stripe-checkout-sessions';
import { FakeStripeCheckoutClient } from './test-helpers/fake-stripe-checkout-client';

// Every session the fake creates under the frozen clock shares one `created`
// second, so the production tail scan finds an ambiguous newest match, logs
// its fallback and walks the bounded recovery-key chain: the same walk the
// retired stub forced by listing nothing at all.
const fixedNowMs = 1_700_000_000_000;
const TAIL_SCAN_FALLBACK =
  'Falling back to bounded checkout replay traversal after tail scan was inconclusive';
const RECOVERY_RETRY =
  'Retrying checkout session creation with recovery idempotency key';

type CheckoutInput = Parameters<typeof createStripeCheckoutSession>[0]['input'];

function sessionUrl(id: string): string {
  return `https://checkout.stripe.test/${id}`;
}

describe('createStripeCheckoutSession recovery', () => {
  const appUserId = crypto.randomUUID();
  const input: CheckoutInput = {
    userId: appUserId,
    externalCustomerId: 'cus_123',
    ...createTestRenewalTerms('monthly'),
    successUrl: 'https://app/success',
    cancelUrl: 'https://app/cancel',
  };
  const priceIds = { monthly: 'price_m', annual: 'price_a' } as const;

  function createCheckout(
    stripe: FakeStripeCheckoutClient,
    overrides: Partial<CheckoutInput> = {},
    logger = new FakeLogger(),
  ): Promise<{ url: string }> {
    return createStripeCheckoutSession({
      stripe,
      input: { ...input, ...overrides },
      priceIds,
      logger,
      nowMs: () => fixedNowMs,
    });
  }

  function recoveryKey(sessionId: string): string {
    return `checkout_session_recovery:${appUserId}:monthly:${sessionId}`;
  }

  // Runs production once, completes its `cs_fake_1`, then chains `count - 1`
  // completed recovery links at the same second; returns the call counts to
  // slice the seed away from the act.
  async function seedTiedCompletedChain(
    stripe: FakeStripeCheckoutClient,
    count: number,
  ): Promise<{ createCallsBefore: number; retrieveCallsBefore: number }> {
    await createCheckout(stripe);
    const params = stripe.createCalls[0]?.params;
    if (!params) throw new Error('Expected the primary create params');
    let tailId = 'cs_fake_1';
    stripe.markComplete(tailId);
    for (let index = 1; index < count; index += 1) {
      const link = await stripe.checkout.sessions.create(params, {
        idempotencyKey: recoveryKey(tailId),
      });
      stripe.markComplete(link.id);
      tailId = link.id;
    }
    return {
      createCallsBefore: stripe.createCalls.length,
      retrieveCallsBefore: stripe.retrieveCalls.length,
    };
  }

  it('recovers with a deterministic request key when Stripe rejects stale primary key parameters', async () => {
    const stripe = new FakeStripeCheckoutClient(() => fixedNowMs);
    // The primary key was first used with different parameters: the same
    // user, plan and trial, but another customer.
    await createCheckout(stripe, {
      externalCustomerId: 'cus_stale',
      trialPeriodDays: 7,
    });
    const seededCreates = stripe.createCalls.length;

    await expect(
      createCheckout(stripe, { trialPeriodDays: 7 }),
    ).resolves.toEqual({ url: sessionUrl('cs_fake_2') });

    const creates = stripe.createCalls.slice(seededCreates);
    expect(creates.map(({ params }) => params.consent_collection)).toEqual([
      { terms_of_service: 'required' },
      { terms_of_service: 'required' },
    ]);
    expect(creates.map(({ params }) => params.metadata)).toEqual([
      expect.objectContaining({
        renewal_disclosure_version: '2026-08-05',
        renewal_terms_hash: 'test-terms-hash',
      }),
      expect.objectContaining({
        renewal_disclosure_version: '2026-08-05',
        renewal_terms_hash: 'test-terms-hash',
      }),
    ]);
    expect(creates[0]?.options).toEqual({
      idempotencyKey: `checkout_session:${appUserId}:monthly:trial:7`,
    });
    expect(creates[1]?.options?.idempotencyKey).toMatch(
      new RegExp(
        `^checkout_session_recovery:${appUserId}:monthly:request:[a-f0-9]{16}:trial:7$`,
      ),
    );
    expect(creates[1]?.options).not.toEqual(creates[0]?.options);
  });

  it('does not retry non-idempotency checkout create errors with a new key', async () => {
    const stripe = new FakeStripeCheckoutClient(() => fixedNowMs);
    const createError = new Error('Stripe checkout configuration failed');
    stripe.setCreateFault(() => {
      throw createError;
    });

    await expect(createCheckout(stripe)).rejects.toThrow(
      'Stripe checkout configuration failed',
    );

    expect(stripe.createCalls).toHaveLength(1);
  });

  it('walks the recovery key chain when deterministic keys replay completed checkout sessions', async () => {
    const stripe = new FakeStripeCheckoutClient(() => fixedNowMs);
    const { createCallsBefore, retrieveCallsBefore } =
      await seedTiedCompletedChain(stripe, 2);

    await expect(createCheckout(stripe)).resolves.toEqual({
      url: sessionUrl('cs_fake_3'),
    });

    expect(stripe.retrieveCalls.slice(retrieveCallsBefore)).toEqual([
      'cs_fake_1',
      'cs_fake_2',
      'cs_fake_3',
    ]);
    expect(
      stripe.createCalls.slice(createCallsBefore).map(({ options }) => options),
    ).toEqual([
      { idempotencyKey: `checkout_session:${appUserId}:monthly` },
      { idempotencyKey: recoveryKey('cs_fake_1') },
      { idempotencyKey: recoveryKey('cs_fake_2') },
    ]);
  });

  it('walks six retained completed replays before returning a fresh open Session', async () => {
    const stripe = new FakeStripeCheckoutClient(() => fixedNowMs);
    const { createCallsBefore, retrieveCallsBefore } =
      await seedTiedCompletedChain(stripe, 6);
    const logger = new FakeLogger();

    await expect(createCheckout(stripe, {}, logger)).resolves.toEqual({
      url: sessionUrl('cs_fake_7'),
    });

    expect(stripe.createCalls.length - createCallsBefore).toBe(7);
    expect(stripe.retrieveCalls.length - retrieveCallsBefore).toBe(7);
    expect(
      logger.warnCalls
        .filter(({ msg }) => msg === RECOVERY_RETRY)
        .map(({ context }) => context.recoveryAttempt),
    ).toEqual([1, 2, 3, 4]);
    expect(
      logger.errorCalls.map(({ context }) => context.recoveryAttempt),
    ).toEqual([5, 6]);
    // The only other warning is the tail scan giving up on the tied second.
    expect(
      logger.warnCalls
        .filter(({ msg }) => msg !== RECOVERY_RETRY)
        .map(({ msg, context }) => ({ msg, reason: context.reason })),
    ).toEqual([
      {
        msg: TAIL_SCAN_FALLBACK,
        reason: 'newest-matching-second-is-ambiguous',
      },
    ]);
  });

  it('succeeds when the primary plus L - 1 recoveries are terminal and recovery create L is open', async () => {
    const stripe = new FakeStripeCheckoutClient(() => fixedNowMs);
    const { createCallsBefore } = await seedTiedCompletedChain(
      stripe,
      SUBSCRIPTION_CHECKOUT_REPLAY_TRAVERSAL_LIMIT,
    );

    await expect(createCheckout(stripe)).resolves.toEqual({
      url: sessionUrl(
        `cs_fake_${SUBSCRIPTION_CHECKOUT_REPLAY_TRAVERSAL_LIMIT + 1}`,
      ),
    });

    expect(stripe.createCalls.length - createCallsBefore).toBe(
      SUBSCRIPTION_CHECKOUT_REPLAY_TRAVERSAL_LIMIT + 1,
    );
  });

  it('throws after the primary plus L recoveries are terminal without issuing recovery create L + 1', async () => {
    const stripe = new FakeStripeCheckoutClient(() => fixedNowMs);
    const { createCallsBefore } = await seedTiedCompletedChain(
      stripe,
      SUBSCRIPTION_CHECKOUT_REPLAY_TRAVERSAL_LIMIT + 1,
    );

    await expect(createCheckout(stripe)).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
      message: 'Stripe Checkout Session is expired or inactive',
    });

    expect(stripe.createCalls.length - createCallsBefore).toBe(
      SUBSCRIPTION_CHECKOUT_REPLAY_TRAVERSAL_LIMIT + 1,
    );
  });
});
