import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CheckoutSessionCreateParams } from '@/src/adapters/shared/stripe-types';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import {
  createTestCheckoutRenewalMetadata,
  createTestRenewalTerms,
} from '@/src/application/test-helpers/renewal-terms';
import {
  createStripeCheckoutSession,
  SUBSCRIPTION_LIST_LIMIT,
} from './stripe-checkout-sessions';
import { FakeStripeCheckoutClient } from './test-helpers/fake-stripe-checkout-client';

const DAY_MS = 24 * 60 * 60 * 1000;

function sessionUrl(id: string): string {
  return `https://checkout.stripe.test/${id}`;
}

function expireCall(sessionId: string) {
  return {
    sessionId,
    options: { idempotencyKey: `expire_checkout_session:${sessionId}` },
  };
}

function alreadyTerminalError(message: string, code?: string): Error {
  return Object.assign(new Error(message), {
    rawType: 'invalid_request_error',
    ...(code ? { code } : {}),
  });
}

describe('createStripeCheckoutSession', () => {
  const appUserId = crypto.randomUUID();
  const input = {
    userId: appUserId,
    externalCustomerId: 'cus_123',
    ...createTestRenewalTerms('monthly'),
    successUrl: 'https://app/success',
    cancelUrl: 'https://app/cancel',
  };
  const priceIds = { monthly: 'price_m', annual: 'price_a' } as const;
  const fixedNowMs = 1_700_000_000_000;
  const nowMs = () => fixedNowMs;
  let logger: FakeLogger;
  // The fake reads this clock when it creates a Session (`created` second
  // and 24h `expires_at`); cases move it only while seeding.
  let fakeNowMs = fixedNowMs;

  beforeEach(() => {
    logger = new FakeLogger();
    fakeNowMs = fixedNowMs;
  });

  function createFake(): FakeStripeCheckoutClient {
    return new FakeStripeCheckoutClient(() => fakeNowMs);
  }

  function createCheckout(
    stripe: FakeStripeCheckoutClient,
    checkoutInput: typeof input & { trialPeriodDays?: number } = input,
  ): Promise<{ url: string }> {
    return createStripeCheckoutSession({
      stripe,
      input: checkoutInput,
      priceIds,
      logger,
      nowMs,
    });
  }

  // Seeds an open Session for the customer through the fake's own `create`
  // under the requested clock, so `expires_at` lands where the case needs it.
  async function seedOpenSession(
    stripe: FakeStripeCheckoutClient,
    session: {
      priceId?: string;
      metadata?: Record<string, string>;
      clockMs?: number;
    } = {},
  ): Promise<string> {
    const { priceId = 'price_m', metadata, clockMs = fixedNowMs } = session;
    const params: CheckoutSessionCreateParams = {
      mode: 'subscription',
      customer: 'cus_123',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: 'https://app/success',
      cancel_url: 'https://app/cancel',
      ...(metadata ? { metadata } : {}),
    };
    const before = fakeNowMs;
    fakeNowMs = clockMs;
    const created = await stripe.checkout.sessions.create(params, {
      idempotencyKey: `seed_existing:${randomUUID()}`,
    });
    fakeNowMs = before;
    return created.id;
  }

  function failFirstInspection(
    stripe: FakeStripeCheckoutClient,
    sessionId: string,
  ): void {
    let failed = false;
    stripe.setRetrieveOverride((session) => {
      if (session.id === sessionId && !failed) {
        failed = true;
        throw new Error('retrieve failed');
      }
      return session;
    });
  }

  it('uses a deterministic fallback idempotency key when caller key is missing', async () => {
    const stripe = createFake();

    await expect(createCheckout(stripe)).resolves.toEqual({
      url: sessionUrl('cs_fake_1'),
    });

    expect(stripe.createCalls).toEqual([
      {
        params: expect.objectContaining({
          consent_collection: { terms_of_service: 'required' },
        }),
        options: { idempotencyKey: `checkout_session:${appUserId}:monthly` },
      },
    ]);
  });

  it('creates a fresh session when deterministic fallback key replays a session expiring at the injected nowMs boundary', async () => {
    // The first Session the fake creates expires exactly at the frozen now
    // (its clock sits a day back for that create only); the recovery create
    // happens at the frozen now.
    let stripe: FakeStripeCheckoutClient;
    stripe = new FakeStripeCheckoutClient(() =>
      stripe.createCalls.length <= 1 ? fixedNowMs - DAY_MS : fixedNowMs,
    );

    await expect(createCheckout(stripe)).resolves.toEqual({
      url: sessionUrl('cs_fake_2'),
    });

    expect(stripe.createCalls.map(({ options }) => options)).toEqual([
      { idempotencyKey: `checkout_session:${appUserId}:monthly` },
      {
        idempotencyKey: `checkout_session_recovery:${appUserId}:monthly:cs_fake_1`,
      },
    ]);
  });

  it('throws STRIPE_ERROR when recovered session is missing URL', async () => {
    let stripe: FakeStripeCheckoutClient;
    stripe = new FakeStripeCheckoutClient(() =>
      stripe.createCalls.length <= 1 ? fixedNowMs - DAY_MS : fixedNowMs,
    );
    const withoutUrl = (session: { id: string; url: string | null }) =>
      session.id === 'cs_fake_2' ? { ...session, url: null } : session;
    stripe.setCreateResponseOverride(withoutUrl);
    stripe.setRetrieveOverride(withoutUrl);

    await expect(createCheckout(stripe)).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
      message: 'Stripe Checkout Session URL is missing',
    });

    expect(stripe.createCalls).toHaveLength(2);
  });

  it('preserves this-binding when calling subscriptions.list', async () => {
    const stripe = createFake();
    // The fake's `list` reads `this`, as the SDK method does; without the
    // adapter's `.bind` the call would throw instead of listing.
    stripe.seedSubscription({
      id: 'sub_active',
      customer: 'cus_123',
      status: 'active',
    });

    await expect(createCheckout(stripe)).rejects.toMatchObject({
      code: 'ALREADY_SUBSCRIBED',
    });

    expect(stripe.subscriptions.listCalls).toEqual([
      { customer: 'cus_123', status: 'all', limit: SUBSCRIPTION_LIST_LIMIT },
    ]);
  });

  it.each(['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused'])(
    'rejects checkout with ALREADY_SUBSCRIBED while the customer has a %s Subscription',
    async (status) => {
      const stripe = createFake();
      stripe.seedSubscription({
        id: 'sub_blocking',
        customer: 'cus_123',
        status,
      });

      await expect(createCheckout(stripe)).rejects.toMatchObject({
        code: 'ALREADY_SUBSCRIBED',
      });

      expect(stripe.listCalls).toEqual([]);
      expect(stripe.createCalls).toEqual([]);
    },
  );

  it('creates a checkout session when every Subscription is canceled or incomplete_expired', async () => {
    const stripe = createFake();
    stripe.seedSubscription({
      id: 'sub_canceled',
      customer: 'cus_123',
      status: 'canceled',
    });
    stripe.seedSubscription({
      id: 'sub_incomplete_expired',
      customer: 'cus_123',
      status: 'incomplete_expired',
    });

    await expect(createCheckout(stripe)).resolves.toEqual({
      url: sessionUrl('cs_fake_1'),
    });

    expect(stripe.subscriptions.listCalls).toEqual([
      { customer: 'cus_123', status: 'all', limit: SUBSCRIPTION_LIST_LIMIT },
    ]);
    expect(stripe.createCalls).toHaveLength(1);
  });

  it('fails closed when Stripe returns an unrecognized subscription status', async () => {
    const stripe = createFake();
    stripe.seedSubscription({
      id: 'sub_future_status',
      customer: 'cus_123',
      status: 'future_status',
    });

    await expect(createCheckout(stripe)).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
      message: 'Stripe subscription status is invalid',
    });

    expect(stripe.listCalls).toEqual([]);
    expect(stripe.createCalls).toEqual([]);
  });

  it('reuses an existing open checkout session when plan price matches and expires after the injected nowMs boundary', async () => {
    const stripe = createFake();
    const existingId = await seedOpenSession(stripe, {
      metadata: createTestCheckoutRenewalMetadata({ userId: appUserId }),
      clockMs: fixedNowMs - DAY_MS + 1_000,
    });
    const seededCreates = stripe.createCalls.length;

    await expect(createCheckout(stripe)).resolves.toEqual({
      url: sessionUrl(existingId),
    });

    expect(stripe.retrieveRequests).toEqual([
      { sessionId: existingId, params: { expand: ['line_items'] } },
    ]);
    expect(stripe.createCalls.slice(seededCreates)).toEqual([]);
  });

  it('expires an existing same-price checkout session when trial terms are requested', async () => {
    const stripe = createFake();
    const existingId = await seedOpenSession(stripe, {
      clockMs: fixedNowMs - DAY_MS + 1_000,
    });
    const seededCreates = stripe.createCalls.length;

    await expect(
      createCheckout(stripe, { ...input, trialPeriodDays: 7 }),
    ).resolves.toEqual({ url: sessionUrl('cs_fake_2') });

    expect(stripe.expireCalls).toEqual([expireCall(existingId)]);
    expect(stripe.createCalls.slice(seededCreates)).toEqual([
      {
        params: expect.objectContaining({
          payment_method_collection: 'if_required',
          subscription_data: expect.objectContaining({
            trial_period_days: 7,
          }),
        }),
        options: {
          idempotencyKey: `checkout_session_recovery:${appUserId}:monthly:${existingId}:trial:7`,
        },
      },
    ]);
    expect(logger.warnCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          msg: 'Expiring existing checkout session to enforce requested checkout terms',
        }),
      ]),
    );
  });

  it('does not return stale URL when same-price session is already inactive', async () => {
    const stripe = createFake();
    const existingId = await seedOpenSession(stripe);
    const seededCreates = stripe.createCalls.length;
    stripe.setRetrieveOverride((session) =>
      session.id === existingId ? { ...session, status: 'complete' } : session,
    );

    await expect(createCheckout(stripe)).resolves.toEqual({
      url: sessionUrl('cs_fake_2'),
    });

    expect(stripe.createCalls.slice(seededCreates)).toHaveLength(1);
    expect(stripe.expireCalls).toEqual([]);
  });

  it('does not return stale URL when same-price session expires at the injected nowMs boundary', async () => {
    const stripe = createFake();
    await seedOpenSession(stripe, { clockMs: fixedNowMs - DAY_MS });
    const seededCreates = stripe.createCalls.length;

    await expect(createCheckout(stripe)).resolves.toEqual({
      url: sessionUrl('cs_fake_2'),
    });

    expect(stripe.createCalls.slice(seededCreates)).toHaveLength(1);
    expect(stripe.expireCalls).toEqual([]);
  });

  it('expires mismatched open checkout session and creates a new session', async () => {
    const stripe = createFake();
    const existingId = await seedOpenSession(stripe, { priceId: 'price_a' });
    const seededCreates = stripe.createCalls.length;

    await expect(createCheckout(stripe)).resolves.toEqual({
      url: sessionUrl('cs_fake_2'),
    });

    expect(stripe.expireCalls).toEqual([expireCall(existingId)]);
    expect(
      stripe.createCalls.slice(seededCreates).map(({ options }) => options),
    ).toEqual([{ idempotencyKey: `checkout_session:${appUserId}:monthly` }]);
  });

  it('throws STRIPE_ERROR when expiring mismatched session fails', async () => {
    const stripe = createFake();
    await seedOpenSession(stripe, { priceId: 'price_a' });
    stripe.setExpireFault(() => {
      throw new Error('expire failed');
    });

    await expect(createCheckout(stripe)).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
      message: 'Failed to expire existing checkout session',
    });
  });

  it('treats already-terminal expire error as idempotent success and creates new session', async () => {
    const stripe = createFake();
    const existingId = await seedOpenSession(stripe, { priceId: 'price_a' });
    const seededCreates = stripe.createCalls.length;
    // Stripe reports an already-terminal error only for a Session that is
    // terminal, so the fault leaves the existing Session expired first.
    stripe.setExpireFault((sessionId) => {
      stripe.markExpired(sessionId);
      throw alreadyTerminalError(
        `No such checkout.session: '${existingId}'`,
        'resource_missing',
      );
    });

    await expect(createCheckout(stripe)).resolves.toEqual({
      url: sessionUrl('cs_fake_2'),
    });
    await expect(
      stripe.checkout.sessions.retrieve(existingId),
    ).resolves.toEqual(expect.objectContaining({ status: 'expired' }));

    expect(stripe.expireCalls).toEqual([expireCall(existingId)]);
    expect(stripe.createCalls.slice(seededCreates)).toHaveLength(1);
    expect(logger.infoCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          msg: 'Treating already-terminal checkout session expire error as success',
        }),
      ]),
    );
    expect(logger.warnCalls).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          msg: 'Failed to expire existing checkout session after failed inspection; continuing with checkout creation',
        }),
      ]),
    );
  });

  it('treats expire error as idempotent success via message fallback when code is absent', async () => {
    const stripe = createFake();
    const existingId = await seedOpenSession(stripe, { priceId: 'price_a' });
    const seededCreates = stripe.createCalls.length;
    // No `code` property: exercises the message-pattern fallback branch. The
    // fault leaves the Session expired first, as Stripe's error implies.
    stripe.setExpireFault((sessionId) => {
      stripe.markExpired(sessionId);
      throw alreadyTerminalError('This checkout session has already expired');
    });

    await expect(createCheckout(stripe)).resolves.toEqual({
      url: sessionUrl('cs_fake_2'),
    });

    expect(stripe.expireCalls).toEqual([expireCall(existingId)]);
    expect(stripe.createCalls.slice(seededCreates)).toHaveLength(1);
    expect(logger.infoCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          msg: 'Treating already-terminal checkout session expire error as success',
        }),
      ]),
    );
  });

  it('throws STRIPE_ERROR when the terminal message is present but rawType differs', async () => {
    const stripe = createFake();
    const existingId = await seedOpenSession(stripe, { priceId: 'price_a' });
    const seededCreates = stripe.createCalls.length;
    stripe.setExpireFault(() => {
      throw Object.assign(
        new Error('This checkout session has already expired'),
        { rawType: 'api_error' },
      );
    });

    await expect(createCheckout(stripe)).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
      message: 'Failed to expire existing checkout session',
    });

    expect(stripe.expireCalls).toEqual([expireCall(existingId)]);
    expect(stripe.createCalls.slice(seededCreates)).toEqual([]);
    expect(logger.infoCalls).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          msg: 'Treating already-terminal checkout session expire error as success',
        }),
      ]),
    );
  });

  it('creates a new checkout session when existing session inspection fails', async () => {
    const stripe = createFake();
    const existingId = await seedOpenSession(stripe);
    const seededCreates = stripe.createCalls.length;
    const seededRetrieves = stripe.retrieveCalls.length;
    failFirstInspection(stripe, existingId);

    await expect(createCheckout(stripe)).resolves.toEqual({
      url: sessionUrl('cs_fake_2'),
    });

    expect(stripe.retrieveCalls.slice(seededRetrieves)).toEqual([
      existingId,
      'cs_fake_2',
    ]);
    expect(stripe.expireCalls).toEqual([expireCall(existingId)]);
    expect(stripe.createCalls.slice(seededCreates)).toHaveLength(1);
    expect(logger.warnCalls).toContainEqual({
      context: expect.objectContaining({
        sessionId: existingId,
        error: 'retrieve failed',
      }),
      msg: 'Failed to inspect existing checkout session',
    });
  });

  it('retries a failed pre-create expire during post-create reconciliation', async () => {
    const stripe = createFake();
    const existingId = await seedOpenSession(stripe);
    const seededCreates = stripe.createCalls.length;
    const seededRetrieves = stripe.retrieveCalls.length;
    failFirstInspection(stripe, existingId);
    let expireFailures = 0;
    stripe.setExpireFault(() => {
      if (expireFailures === 0) {
        expireFailures += 1;
        throw new Error('pre-create expire failed');
      }
    });

    await expect(createCheckout(stripe)).resolves.toEqual({
      url: sessionUrl('cs_fake_2'),
    });

    expect(stripe.retrieveCalls.slice(seededRetrieves)).toEqual([
      existingId,
      'cs_fake_2',
    ]);
    expect(stripe.expireCalls).toEqual([
      expireCall(existingId),
      expireCall(existingId),
    ]);
    expect(stripe.createCalls.slice(seededCreates)).toHaveLength(1);
    expect(logger.warnCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          msg: 'Failed to expire existing checkout session after failed inspection; continuing with checkout creation',
        }),
      ]),
    );
  });

  it('throws when inspection and both expire attempts fail', async () => {
    const stripe = createFake();
    const existingId = await seedOpenSession(stripe);
    failFirstInspection(stripe, existingId);
    stripe.setExpireFault(() => {
      throw new Error('expire failed');
    });

    await expect(createCheckout(stripe)).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
      message: 'Failed to reconcile open checkout sessions',
    });

    expect(stripe.expireCalls).toEqual([
      expireCall(existingId),
      expireCall(existingId),
    ]);
  });

  it('throws STRIPE_ERROR when created session is missing URL', async () => {
    const stripe = createFake();
    const withoutUrl = (session: { id: string; url: string | null }) => ({
      ...session,
      url: null,
    });
    stripe.setCreateResponseOverride(withoutUrl);
    stripe.setRetrieveOverride(withoutUrl);

    await expect(createCheckout(stripe)).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
      message: 'Stripe Checkout Session URL is missing',
    });
  });
});
