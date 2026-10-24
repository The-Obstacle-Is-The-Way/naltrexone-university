import { describe, expect, it } from 'vitest';
import {
  FakeLogger,
  FakeOperationalAlerts,
} from '@/src/application/test-helpers/fakes';
import { createTestRenewalTerms } from '@/src/application/test-helpers/renewal-terms';
import { StripeCallBudget } from './stripe-call-budget';
import { createStripeCheckoutSession } from './stripe-checkout-sessions';
import { FakeStripeCheckoutClient } from './test-helpers/fake-stripe-checkout-client';

const input = {
  userId: crypto.randomUUID(),
  externalCustomerId: 'cus_budget',
  ...createTestRenewalTerms('monthly'),
  successUrl: 'https://app.example/success',
  cancelUrl: 'https://app.example/cancel',
};
function checkout(stripe: FakeStripeCheckoutClient) {
  return createStripeCheckoutSession({
    stripe,
    input,
    priceIds: { monthly: 'price_m', annual: 'price_a' },
    logger: new FakeLogger(),
    operationalAlerts: new FakeOperationalAlerts(),
    budget: new StripeCallBudget(),
  });
}

describe('checkout recovery caller budget', () => {
  it('does not add outer retries to the final subscription recheck', async () => {
    const stripe = new FakeStripeCheckoutClient();
    stripe.setSubscriptionListHook(() => {
      if (stripe.subscriptions.listCalls.length > 1)
        throw Object.assign(new Error('Provider unavailable'), {
          statusCode: 503,
        });
    });
    await expect(checkout(stripe)).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
    });
    expect(stripe.subscriptions.listCalls).toHaveLength(2);
  });

  it('does not add outer retries to the inactive-session tail scan', async () => {
    const stripe = new FakeStripeCheckoutClient();
    await checkout(stripe);
    stripe.markComplete('cs_fake_1');
    stripe.setListHook((params) => {
      if (!params.status)
        throw Object.assign(new Error('Provider unavailable'), {
          statusCode: 503,
        });
    });
    await expect(checkout(stripe)).resolves.toHaveProperty('url');
    expect(stripe.listCalls.filter((params) => !params.status)).toHaveLength(1);
  });
});
