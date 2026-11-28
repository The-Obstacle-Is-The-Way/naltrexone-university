import { MS_PER_SECOND } from '@/src/domain/services';
import { runStripeCheckoutClientContract } from '@/tests/shared/stripe-checkout-client-contract';
import { FakeStripeCheckoutClient } from './fake-stripe-checkout-client';

const SUBSCRIPTION_PERIOD_SECONDS = 30 * 24 * 60 * 60;

runStripeCheckoutClientContract('FakeStripeCheckoutClient', async () => {
  // The fake stamps Sessions by this clock. The contract's last scenario runs
  // the checkout adapter with its own clock, the wall clock, which decides
  // whether a Session has expired, so the two start together. No case asserts
  // an absolute time.
  let nowMs = Date.now();
  let subscriptionSequence = 0;
  let paymentMethodSequence = 0;
  const stripe = new FakeStripeCheckoutClient(() => nowMs);
  // BUG-321: Stripe sends these on every Subscription, a canceled one
  // included, and the adapter's schema requires them. The fake stores what a
  // case seeds, so both seeds carry them, as a Subscription just created on
  // the contract price does.
  const subscriptionFieldsStripeAlwaysSends = () => {
    const startedAt = Math.floor(nowMs / MS_PER_SECOND);
    return {
      cancel_at_period_end: false,
      start_date: startedAt,
      billing_cycle_anchor: startedAt,
      metadata: { user_id: 'debt472_contract_user' },
      items: {
        data: [
          {
            current_period_end: startedAt + SUBSCRIPTION_PERIOD_SECONDS,
            price: { id: 'price_contract' },
          },
        ],
      },
    };
  };

  return {
    sessions: stripe.checkout.sessions,
    subscriptions: stripe.subscriptions,
    customers: stripe.customers,
    paymentMethods: stripe.paymentMethods,
    portalConfigurations: stripe.billingPortal.configurations,
    seedPaymentMethod: async () => {
      paymentMethodSequence += 1;
      const id = `pm_fake_${paymentMethodSequence}`;
      stripe.seedPaymentMethod({ id, customer: null });
      return { id };
    },
    seedCustomer: async (userId) => ({
      id: stripe.seedCustomer({ user_id: userId }),
    }),
    deleteCustomer: async (customerId) => {
      stripe.deleteCustomer(customerId);
    },
    // Immediately consistent: the first read is the settled answer.
    searchUntil: (params) => stripe.customers.search(params),
    seedSubscription: async () => {
      subscriptionSequence += 1;
      const id = `sub_fake_${subscriptionSequence}`;
      stripe.seedSubscription({
        id,
        customer: 'cus_contract',
        status: 'active',
        ...subscriptionFieldsStripeAlwaysSends(),
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
        ...subscriptionFieldsStripeAlwaysSends(),
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
