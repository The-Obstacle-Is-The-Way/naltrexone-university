import { describe, expect, it } from 'vitest';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { createTestRenewalTerms } from '@/src/application/test-helpers/renewal-terms';
import { createStripeCheckoutSession } from './stripe-checkout-sessions';
import { FakeStripeCheckoutClient } from './test-helpers/fake-stripe-checkout-client';

// The maintained fake creates `cs_fake_1` first and serves it from live
// retrieval; each case bends only the retrieval result through the fake's
// override seam, so the create/replay plumbing is the contracted one rather
// than a re-implementation.
describe('createStripeCheckoutSession live retrieval fallback', () => {
  const input = {
    userId: crypto.randomUUID(),
    externalCustomerId: 'customer-existing-123',
    ...createTestRenewalTerms('monthly'),
    successUrl: 'https://app/success',
    cancelUrl: 'https://app/cancel',
  };
  const priceIds = {
    monthly: 'monthly-price-id',
    annual: 'annual-price-id',
  } as const;

  it('falls back to the created checkout session when live retrieval fails', async () => {
    const logger = new FakeLogger();
    const stripe = new FakeStripeCheckoutClient();
    stripe.setRetrieveOverride(async () => {
      throw new Error('retrieve failed');
    });

    await expect(
      createStripeCheckoutSession({ stripe, input, priceIds, logger }),
    ).resolves.toEqual({ url: 'https://checkout.stripe.test/cs_fake_1' });

    expect(stripe.retrieveCalls).toEqual(['cs_fake_1']);
    expect(logger.warnCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          msg: 'Falling back to created checkout session snapshot after live retrieval failed',
        }),
      ]),
    );
  });

  it('falls back to the created checkout session when live retrieval returns a different session id', async () => {
    const logger = new FakeLogger();
    const stripe = new FakeStripeCheckoutClient();
    stripe.setRetrieveOverride((session) => ({
      ...session,
      id: `${session.id}_mismatch`,
    }));

    await expect(
      createStripeCheckoutSession({ stripe, input, priceIds, logger }),
    ).resolves.toEqual({ url: 'https://checkout.stripe.test/cs_fake_1' });

    expect(stripe.retrieveCalls).toEqual(['cs_fake_1']);
    expect(logger.warnCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          msg: 'Ignoring checkout session retrieval result with mismatched id',
        }),
      ]),
    );
  });
});
