// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createSubscription } from '@/src/domain/test-helpers';
import {
  FakePaymentGateway,
  FakeStripeCustomerRepository,
  FakeSubscriptionRepository,
} from '../test-helpers/fakes';
import { CreateCheckoutSessionUseCase } from './create-checkout-session';

describe('CreateCheckoutSessionUseCase', () => {
  it('returns ALREADY_SUBSCRIBED when a subscription is still current', async () => {
    const paymentGateway = new FakePaymentGateway({
      stripeCustomerId: 'cus_new',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: { eventId: 'evt_1', type: 'checkout.session.completed' },
    });

    const subscriptions = new FakeSubscriptionRepository([
      createSubscription({
        userId: 'user-1',
        status: 'past_due',
        currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
      }),
    ]);

    const useCase = new CreateCheckoutSessionUseCase(
      new FakeStripeCustomerRepository(),
      subscriptions,
      paymentGateway,
      () => new Date('2026-02-01T00:00:00Z'),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        clerkUserId: 'clerk-1',
        email: 'user@example.com',
        plan: 'monthly',
        successUrl:
          'https://app.example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://app.example.com/pricing?checkout=cancel',
      }),
    ).rejects.toMatchObject({ code: 'ALREADY_SUBSCRIBED' });

    expect(paymentGateway.customerInputs).toEqual([]);
    expect(paymentGateway.checkoutInputs).toEqual([]);
  });

  it('returns checkout URL when stripe customer mapping exists', async () => {
    const paymentGateway = new FakePaymentGateway({
      stripeCustomerId: 'cus_should_not_be_used',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: { eventId: 'evt_1', type: 'checkout.session.completed' },
    });

    const stripeCustomers = new FakeStripeCustomerRepository();
    await stripeCustomers.insert('user-1', 'cus_existing');

    const useCase = new CreateCheckoutSessionUseCase(
      stripeCustomers,
      new FakeSubscriptionRepository(),
      paymentGateway,
      () => new Date('2026-02-01T00:00:00Z'),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        clerkUserId: null,
        email: 'user@example.com',
        plan: 'annual',
        successUrl:
          'https://app.example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://app.example.com/pricing?checkout=cancel',
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout' });

    expect(paymentGateway.customerInputs).toEqual([]);
    expect(paymentGateway.checkoutInputs).toEqual([
      {
        userId: 'user-1',
        stripeCustomerId: 'cus_existing',
        plan: 'annual',
        successUrl:
          'https://app.example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://app.example.com/pricing?checkout=cancel',
      },
    ]);
  });

  it('returns checkout URL and creates stripe customer mapping when missing', async () => {
    const paymentGateway = new FakePaymentGateway({
      stripeCustomerId: 'cus_new',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: { eventId: 'evt_1', type: 'checkout.session.completed' },
    });

    const stripeCustomers = new FakeStripeCustomerRepository();

    const useCase = new CreateCheckoutSessionUseCase(
      stripeCustomers,
      new FakeSubscriptionRepository(),
      paymentGateway,
      () => new Date('2026-02-01T00:00:00Z'),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        clerkUserId: 'clerk-1',
        email: 'user@example.com',
        plan: 'monthly',
        successUrl:
          'https://app.example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://app.example.com/pricing?checkout=cancel',
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout' });

    await expect(stripeCustomers.findByUserId('user-1')).resolves.toEqual({
      stripeCustomerId: 'cus_new',
    });

    expect(paymentGateway.customerInputs).toEqual([
      {
        userId: 'user-1',
        clerkUserId: 'clerk-1',
        email: 'user@example.com',
      },
    ]);
    expect(paymentGateway.customerOptions).toEqual([
      { idempotencyKey: 'stripe_customer:user-1' },
    ]);
    expect(paymentGateway.checkoutInputs).toEqual([
      {
        userId: 'user-1',
        stripeCustomerId: 'cus_new',
        plan: 'monthly',
        successUrl:
          'https://app.example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://app.example.com/pricing?checkout=cancel',
      },
    ]);
  });
});
