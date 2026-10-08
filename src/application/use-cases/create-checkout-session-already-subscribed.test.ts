import { describe, expect, it } from 'vitest';
import { createSubscription } from '@/src/domain/test-helpers';
import { ApplicationError } from '../errors';
import {
  FakeLogger,
  FakeOperationalAlerts,
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
    const alerts = new FakeOperationalAlerts();
    const useCase = new CreateCheckoutSessionUseCase(
      stripeCustomers,
      subscriptions,
      payments,
      logger,
      alerts,
      () => new Date('2026-02-01T00:00:00Z'),
      getRenewalTerms,
    );
    return { payments, subscriptions, logger, alerts, useCase };
  }

  it("records the customer's subscription from Stripe and still refuses", async () => {
    const { payments, subscriptions, alerts, useCase } =
      await refusedCheckout();

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
    expect(alerts.raised).toEqual([]);
  });

  it('logs and alerts on a sync that fails, and still refuses', async () => {
    const { subscriptions, logger, alerts, useCase } = await refusedCheckout({
      blockingCustomerSubscriptionsError: new Error('stripe down'),
    });

    await expect(useCase.execute(defaultCheckoutInput)).rejects.toBe(
      stripeRefusal,
    );

    await expect(subscriptions.findByUserId('user-1')).resolves.toBeNull();
    expect(logger.errorCalls).toEqual([
      {
        msg: 'Could not record the subscription Stripe holds for a refused checkout',
        context: {
          userId: 'user-1',
          errorCode: null,
          errorMessage: null,
          errorName: 'Error',
        },
      },
    ]);
    expect(alerts.raised).toEqual([
      { kind: 'checkout_stripe_holds_unrecorded', count: 1 },
    ]);
  });

  // The log names which of the app's own failures it was, so each one can be
  // explained; the message is app-written and holds no provider data.
  it("logs the app's reason when the sync refuses what Stripe listed", async () => {
    const { logger, useCase } = await refusedCheckout({
      blockingCustomerSubscriptions: [{ ...held, userId: 'user-2' }],
    });

    await expect(useCase.execute(defaultCheckoutInput)).rejects.toBe(
      stripeRefusal,
    );
    expect(logger.errorCalls[0]?.context).toEqual({
      userId: 'user-1',
      errorCode: 'CONFLICT',
      errorMessage:
        "A subscription on this customer is not the signed-in user's",
      errorName: 'ApplicationError',
    });
  });

  it('still refuses, and still alerts, when the failure cannot be logged', async () => {
    const { logger, alerts, useCase } = await refusedCheckout({
      blockingCustomerSubscriptionsError: new Error('stripe down'),
    });
    logger.error = () => {
      throw new Error('logger down');
    };

    await expect(useCase.execute(defaultCheckoutInput)).rejects.toBe(
      stripeRefusal,
    );
    expect(alerts.raised).toHaveLength(1);
  });

  it('syncs a refused checkout that carries an idempotency key', async () => {
    const { subscriptions, useCase } = await refusedCheckout();

    await expect(
      useCase.execute({
        ...defaultCheckoutInput,
        idempotencyKey: '0b9a3f9e-5d55-4bd5-9a52-4d3d0e6f8a11',
      }),
    ).rejects.toBe(stripeRefusal);
    await expect(subscriptions.findByUserId('user-1')).resolves.toMatchObject({
      status: 'active',
    });
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
