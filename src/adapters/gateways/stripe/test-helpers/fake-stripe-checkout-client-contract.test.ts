import { runStripeCheckoutClientContract } from '@/tests/shared/stripe-checkout-client-contract';
import { FakeStripeCheckoutClient } from './fake-stripe-checkout-client';

runStripeCheckoutClientContract('FakeStripeCheckoutClient', async () => {
  let nowMs = Date.UTC(2026, 7, 23, 12, 0, 0);
  const stripe = new FakeStripeCheckoutClient(() => nowMs);

  return {
    sessions: stripe.checkout.sessions,
    subscriptionParams: {
      mode: 'subscription',
      customer: 'cus_contract',
      line_items: [{ price: 'price_contract', quantity: 1 }],
      success_url: 'https://app.example.com/success',
      cancel_url: 'https://app.example.com/cancel',
    },
    advanceCreationTime: async () => {
      nowMs += 1_000;
    },
    cleanup: async () => undefined,
  };
});
