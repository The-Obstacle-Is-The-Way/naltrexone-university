import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { CheckoutSessionCreateParams } from '@/src/adapters/shared/stripe-types';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { createTestRenewalTerms } from '@/src/application/test-helpers/renewal-terms';
import { createStripeCheckoutSession } from './stripe-checkout-sessions';
import { FakeStripeCheckoutClient } from './test-helpers/fake-stripe-checkout-client';

function sessionUrl(id: string): string {
  return `https://checkout.stripe.test/${id}`;
}

describe('createStripeCheckoutSession trial replacement idempotency', () => {
  const appUserId = crypto.randomUUID();
  const input = {
    userId: appUserId,
    externalCustomerId: 'cus_123',
    ...createTestRenewalTerms('monthly', true),
    successUrl: 'https://app/success',
    cancelUrl: 'https://app/cancel',
    trialPeriodDays: 7,
  };
  const priceIds = { monthly: 'price_m', annual: 'price_a' } as const;
  // The fake and the adapter share one frozen clock so the seeded Session
  // stays open (the fake expires it 24h after creation).
  const nowMs = () => 1_700_000_000_000;

  function createCheckout(
    stripe: FakeStripeCheckoutClient,
  ): Promise<{ url: string }> {
    return createStripeCheckoutSession({
      stripe,
      input,
      priceIds,
      logger: new FakeLogger(),
      nowMs,
    });
  }

  // Seeds an open trial Session for the customer through the fake's own
  // `create`, priced as the case needs.
  async function seedOpenSession(
    stripe: FakeStripeCheckoutClient,
    priceId: string,
  ): Promise<string> {
    const params: CheckoutSessionCreateParams = {
      mode: 'subscription',
      customer: 'cus_123',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: 'https://app/success',
      cancel_url: 'https://app/cancel',
      metadata: { checkout_variant: 'trial:7' },
      payment_method_collection: 'if_required',
    };
    const created = await stripe.checkout.sessions.create(params, {
      idempotencyKey: `seed_existing:${randomUUID()}`,
    });
    return created.id;
  }

  function trialRecoveryKey(sessionId: string): string {
    return `checkout_session_recovery:${appUserId}:monthly:${sessionId}:trial:7`;
  }

  function expireCall(sessionId: string) {
    return {
      sessionId,
      options: { idempotencyKey: `expire_checkout_session:${sessionId}` },
    };
  }

  it('uses a trial recovery key when expiring a mismatched trial checkout session', async () => {
    const stripe = new FakeStripeCheckoutClient(nowMs);
    const existingId = await seedOpenSession(stripe, 'price_a');
    const seededCreates = stripe.createCalls.length;

    await expect(createCheckout(stripe)).resolves.toEqual({
      url: sessionUrl('cs_fake_2'),
    });

    expect(stripe.expireCalls).toEqual([expireCall(existingId)]);
    expect(stripe.createCalls.slice(seededCreates)).toEqual([
      {
        params: expect.objectContaining({
          consent_collection: { terms_of_service: 'required' },
        }),
        options: { idempotencyKey: trialRecoveryKey(existingId) },
      },
    ]);
  });

  it('uses a trial recovery key when the existing checkout session price cannot be inspected', async () => {
    const stripe = new FakeStripeCheckoutClient(nowMs);
    const existingId = await seedOpenSession(stripe, 'price_m');
    const seededCreates = stripe.createCalls.length;
    stripe.setRetrieveOverride((session) =>
      session.id === existingId
        ? { ...session, line_items: { data: [] } }
        : session,
    );

    await expect(createCheckout(stripe)).resolves.toEqual({
      url: sessionUrl('cs_fake_2'),
    });

    expect(
      stripe.createCalls.slice(seededCreates).map(({ options }) => options),
    ).toEqual([{ idempotencyKey: trialRecoveryKey(existingId) }]);
  });

  it('uses a trial recovery key when existing trial session inspection fails', async () => {
    const stripe = new FakeStripeCheckoutClient(nowMs);
    const existingId = await seedOpenSession(stripe, 'price_m');
    const seededCreates = stripe.createCalls.length;
    const seededRetrieves = stripe.retrieveCalls.length;
    let inspectionsFailed = 0;
    stripe.setRetrieveOverride((session) => {
      if (session.id === existingId && inspectionsFailed === 0) {
        inspectionsFailed += 1;
        throw new Error('retrieve failed');
      }
      return session;
    });

    await expect(createCheckout(stripe)).resolves.toEqual({
      url: sessionUrl('cs_fake_2'),
    });

    expect(stripe.retrieveCalls.slice(seededRetrieves)).toEqual([
      existingId,
      'cs_fake_2',
    ]);
    expect(stripe.expireCalls).toEqual([expireCall(existingId)]);
    expect(
      stripe.createCalls.slice(seededCreates).map(({ options }) => options),
    ).toEqual([{ idempotencyKey: trialRecoveryKey(existingId) }]);
  });
});
