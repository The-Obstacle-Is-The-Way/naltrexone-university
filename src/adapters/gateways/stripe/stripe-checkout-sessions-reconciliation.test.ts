import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { createTestRenewalTerms } from '@/src/application/test-helpers/renewal-terms';
import { createStripeCheckoutSession } from './stripe-checkout-sessions';
import { FakeStripeCheckoutClient } from './test-helpers/fake-stripe-checkout-client';

const HOUR_MS = 60 * 60 * 1000;

function sessionUrl(id: string): string {
  return `https://checkout.stripe.test/${id}`;
}

describe('createStripeCheckoutSession post-create reconciliation', () => {
  const appUserId = crypto.randomUUID();
  const input = {
    userId: appUserId,
    externalCustomerId: 'customer-existing-123',
    ...createTestRenewalTerms('monthly'),
    successUrl: 'https://app/success',
    cancelUrl: 'https://app/cancel',
  };
  const priceIds = {
    monthly: 'monthly-price-id',
    annual: 'annual-price-id',
  } as const;
  const fixedNowMs = 1_700_000_000_000;

  // The fake reads this clock when it creates a Session (its `created` second
  // and 24h `expires_at`); each case moves it only while staging the racer.
  let fakeNowMs = fixedNowMs;

  function createFake(): FakeStripeCheckoutClient {
    fakeNowMs = fixedNowMs;
    return new FakeStripeCheckoutClient(() => fakeNowMs);
  }

  // The only Stripe call between the adapter's create and its reconcile
  // listing is the post-create retrieval, so a racing open Session for the
  // same customer is created there, once, from the adapter's own create
  // params under the requested clock. The reconcile listing then sees it;
  // the preflight listing (limit 1, before the create) never did.
  function stageRacingSession(
    stripe: FakeStripeCheckoutClient,
    racerClockMs: number,
  ): void {
    let staged = false;
    stripe.setRetrieveOverride(async (session) => {
      if (staged) return session;
      staged = true;
      const params = stripe.createCalls[0]?.params;
      if (!params) throw new Error('Expected the adapter create params');
      const before = fakeNowMs;
      fakeNowMs = racerClockMs;
      await stripe.checkout.sessions.create(params, {
        idempotencyKey: `race:${randomUUID()}`,
      });
      fakeNowMs = before;
      return session;
    });
  }

  function createCheckout(
    stripe: FakeStripeCheckoutClient,
    logger: FakeLogger,
    nowMs: () => number = () => fixedNowMs,
  ): Promise<{ url: string }> {
    return createStripeCheckoutSession({
      stripe,
      input,
      priceIds,
      logger,
      nowMs,
    });
  }

  it('treats already-terminal reconcile expire errors as idempotent success', async () => {
    const logger = new FakeLogger();
    const stripe = createFake();
    // Same second as the created Session: the tie goes to the larger id, so
    // the racer `cs_fake_2` is canonical and `cs_fake_1` is superseded.
    stageRacingSession(stripe, fixedNowMs);
    // Stripe reports "already expired" only for a Session that is terminal,
    // so the fault leaves the superseded Session expired before it throws.
    stripe.setExpireFault((sessionId) => {
      stripe.markExpired(sessionId);
      throw Object.assign(
        new Error('This checkout session has already expired'),
        { rawType: 'invalid_request_error', code: 'resource_missing' },
      );
    });

    await expect(createCheckout(stripe, logger)).resolves.toEqual({
      url: sessionUrl('cs_fake_2'),
    });
    await expect(
      stripe.checkout.sessions.retrieve('cs_fake_1'),
    ).resolves.toEqual(
      expect.objectContaining({ status: 'expired', url: null }),
    );

    expect(stripe.expireCalls).toEqual([
      {
        sessionId: 'cs_fake_1',
        options: { idempotencyKey: 'expire_checkout_session:cs_fake_1' },
      },
    ]);
    expect(logger.infoCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          msg: 'Treating already-terminal checkout session expire error as success',
        }),
      ]),
    );
  });

  it('throws when reconciliation cannot expire a superseded checkout session', async () => {
    const logger = new FakeLogger();
    const stripe = createFake();
    stageRacingSession(stripe, fixedNowMs);
    stripe.setExpireFault(() => {
      throw new Error('expire transport failed');
    });

    await expect(createCheckout(stripe, logger)).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
      message: 'Failed to reconcile open checkout sessions',
    });

    expect(logger.errorCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          msg: 'Failed to expire superseded checkout session',
        }),
      ]),
    );
  });

  it('uses the listed canonical session when the created session expires before reconciliation', async () => {
    const logger = new FakeLogger();
    const stripe = createFake();
    // The racer is created twelve hours later, before the reconciliation clock
    // below reads hour 25: it is still open then (24h lifetime), while the
    // created Session, 25 hours old, has expired.
    stageRacingSession(stripe, fixedNowMs + 12 * HOUR_MS);
    const nowValues = [fixedNowMs, fixedNowMs + 25 * HOUR_MS];
    const nowMs = () => nowValues.shift() ?? fixedNowMs + 25 * HOUR_MS;

    await expect(createCheckout(stripe, logger, nowMs)).resolves.toEqual({
      url: sessionUrl('cs_fake_2'),
    });

    expect(stripe.expireCalls).toEqual([]);
  });

  it('ignores inactive listed sessions when choosing the canonical checkout session', async () => {
    const logger = new FakeLogger();
    const stripe = createFake();
    // Created a day earlier, the racer's `expires_at` equals the frozen now,
    // so the reconciliation treats it as inactive and keeps the created one.
    stageRacingSession(stripe, fixedNowMs - 24 * HOUR_MS);

    await expect(createCheckout(stripe, logger)).resolves.toEqual({
      url: sessionUrl('cs_fake_1'),
    });

    expect(stripe.expireCalls).toEqual([]);
  });
});
