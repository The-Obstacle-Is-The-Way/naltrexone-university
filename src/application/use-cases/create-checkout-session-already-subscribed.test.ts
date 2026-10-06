import { describe, expect, it } from 'vitest';
import { createSubscription } from '@/src/domain/test-helpers';
import { ApplicationError } from '../errors';
import {
  FakeLogger,
  FakePaymentGateway,
  FakeStripeCustomerRepository,
  FakeSubscriptionRepository,
} from '../test-helpers/fakes';
import { CreateCheckoutSessionUseCase } from './create-checkout-session';

const defaultCheckoutInput = {
  userId: 'user-1',
  clerkUserId: 'clerk-1',
  email: 'user@example.com',
  plan: 'monthly' as const,
  successUrl:
    'https://app.example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}',
  cancelUrl: 'https://app.example.com/pricing?checkout=cancel',
};

const getRenewalTerms = (plan: 'monthly' | 'annual', hasTrial: boolean) => ({
  plan,
  amountCents: plan === 'monthly' ? 2900 : 19900,
  currency: 'usd' as const,
  frequency: plan === 'monthly' ? ('month' as const) : ('year' as const),
  disclosureVersion: '2026-08-05',
  termsVersion: '2026-08-05',
  termsHash: 'terms-hash',
  disclosureSnapshot: hasTrial
    ? 'Exact trial renewal disclosure.'
    : 'Exact immediate renewal disclosure.',
  cancellationMethod: 'Billing page in the app or support@addictionboards.com',
});

// BUG-321: Stripe refuses a checkout when the customer already holds a
// subscription our database lacks. The use case records it from Stripe, so
// the page can show the truth, and still refuses the checkout.
describe('CreateCheckoutSessionUseCase when Stripe refuses an already-subscribed customer', () => {
  const stripeRefusal = new ApplicationError(
    'ALREADY_SUBSCRIBED',
    'Customer already has an active subscription',
  );
  const held = {
    userId: 'user-1',
    externalCustomerId: 'cus_existing',
    externalSubscriptionId: 'sub_held',
    plan: 'monthly' as const,
    status: 'active' as const,
    currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
    cancelAtPeriodEnd: false,
    startedAt: new Date('2026-01-01T00:00:00Z'),
    billingCycleAnchor: new Date('2026-01-01T00:00:00Z'),
  };

  async function refusedCheckout(
    options: Partial<ConstructorParameters<typeof FakePaymentGateway>[0]> & {
      subscriptions?: FakeSubscriptionRepository;
    } = {},
  ) {
    const { subscriptions: seeded, ...gateway } = options;
    const payments = new FakePaymentGateway({
      externalCustomerId: 'cus_unused',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: { eventId: 'evt_1', type: 'checkout.session.completed' },
      checkoutError: stripeRefusal,
      blockingCustomerSubscriptions: [held],
      ...gateway,
    });
    const stripeCustomers = new FakeStripeCustomerRepository();
    await stripeCustomers.insert('user-1', 'cus_existing');
    const subscriptions = seeded ?? new FakeSubscriptionRepository();
    const logger = new FakeLogger();
    const useCase = new CreateCheckoutSessionUseCase(
      stripeCustomers,
      subscriptions,
      payments,
      logger,
      () => new Date('2026-02-01T00:00:00Z'),
      getRenewalTerms,
    );
    return { payments, subscriptions, logger, useCase };
  }

  it("records the customer's subscription from Stripe and still refuses", async () => {
    const { payments, subscriptions, useCase } = await refusedCheckout();

    await expect(useCase.execute(defaultCheckoutInput)).rejects.toBe(
      stripeRefusal,
    );

    expect(payments.blockingCustomerSubscriptionInputs).toEqual([
      { externalCustomerId: 'cus_existing' },
    ]);
    await expect(subscriptions.findByUserId('user-1')).resolves.toMatchObject({
      status: 'active',
      currentPeriodEnd: held.currentPeriodEnd,
    });
  });

  it('logs a sync that fails and still refuses', async () => {
    const { subscriptions, logger, useCase } = await refusedCheckout({
      blockingCustomerSubscriptionsError: new Error('stripe down'),
    });

    await expect(useCase.execute(defaultCheckoutInput)).rejects.toBe(
      stripeRefusal,
    );

    await expect(subscriptions.findByUserId('user-1')).resolves.toBeNull();
    expect(logger.errorCalls).toEqual([
      expect.objectContaining({
        msg: 'Could not record the subscription Stripe holds for a refused checkout',
      }),
    ]);
  });

  it('does not sync for any other checkout failure', async () => {
    const failure = new ApplicationError('STRIPE_ERROR', 'Stripe is down');
    const { payments, useCase } = await refusedCheckout({
      checkoutError: failure,
    });

    await expect(useCase.execute(defaultCheckoutInput)).rejects.toBe(failure);
    expect(payments.blockingCustomerSubscriptionInputs).toEqual([]);
  });

  it("does not sync when the database's own record refuses the checkout", async () => {
    const { payments, useCase } = await refusedCheckout({
      subscriptions: new FakeSubscriptionRepository([
        createSubscription({
          userId: 'user-1',
          status: 'active',
          currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
        }),
      ]),
    });

    await expect(useCase.execute(defaultCheckoutInput)).rejects.toMatchObject({
      code: 'ALREADY_SUBSCRIBED',
      message: 'Subscription already exists for this user',
    });
    expect(payments.checkoutInputs).toEqual([]);
    expect(payments.blockingCustomerSubscriptionInputs).toEqual([]);
  });
});
