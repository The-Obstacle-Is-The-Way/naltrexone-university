import { runStripeCheckoutClientContract } from '@/tests/shared/stripe-checkout-client-contract';
import { FakeStripeCheckoutClient } from './fake-stripe-checkout-client';

runStripeCheckoutClientContract('FakeStripeCheckoutClient', async () => {
  let nowMs = Date.UTC(2026, 7, 23, 12, 0, 0);
  let subscriptionSequence = 0;
  let paymentMethodSequence = 0;
  const stripe = new FakeStripeCheckoutClient(() => nowMs);

  return {
    sessions: stripe.checkout.sessions,
    subscriptions: stripe.subscriptions,
    customers: stripe.customers,
    paymentMethods: stripe.paymentMethods,
    seedPaymentMethod: async () => {
      paymentMethodSequence += 1;
      const id = `pm_fake_${paymentMethodSequence}`;
      stripe.seedPaymentMethod({ id, customer: null });
      return { id };
    },
    seedCustomer: async (userId) => ({
      id: stripe.seedCustomer({ user_id: userId }),
    }),
    // Immediately consistent: the first read is the settled answer.
    searchUntil: (params) => stripe.customers.search(params),
    seedSubscription: async () => {
      subscriptionSequence += 1;
      const id = `sub_fake_${subscriptionSequence}`;
      stripe.seedSubscription({
        id,
        customer: 'cus_contract',
        status: 'active',
        metadata: { user_id: 'debt472_contract_user' },
        items: {
          data: [
            {
              current_period_end: Math.floor(nowMs / 1000) + 30 * 24 * 3600,
              price: { id: 'price_contract' },
            },
          ],
        },
      });
      return { id, customer: 'cus_contract' };
    },
    seedCanceledSubscription: async () => {
      subscriptionSequence += 1;
      const id = `sub_fake_${subscriptionSequence}`;
      stripe.seedSubscription({
        id,
        customer: 'cus_contract',
        status: 'canceled',
        metadata: { user_id: 'debt472_contract_user' },
        items: { data: [{ price: { id: 'price_contract' } }] },
      });
      return { id, customer: 'cus_contract' };
    },
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
