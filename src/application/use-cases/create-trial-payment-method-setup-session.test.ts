import { describe, expect, it } from 'vitest';
import {
  FakeLogger,
  FakePaymentGateway,
  FakeStripeCustomerRepository,
  FakeSubscriptionRepository,
  FakeTrialPaymentMethodSetupOperationRepository,
} from '@/src/application/test-helpers/fakes';
import { createSubscription } from '@/src/domain/test-helpers';
import { CreateTrialPaymentMethodSetupSessionUseCase } from './create-trial-payment-method-setup-session';

const userId = 'user_1';
const trialEndsAt = new Date('2026-08-13T12:00:00Z');

function createPaymentGateway() {
  return new FakePaymentGateway({
    externalCustomerId: 'cus_unused',
    checkoutUrl: 'https://stripe/checkout',
    trialSetupSessionId: 'cs_setup_123',
    trialSetupUrl: 'https://stripe/setup',
    portalUrl: 'https://stripe/portal',
    webhookResult: { eventId: 'evt_1', type: 'checkout.session.completed' },
  });
}

async function createUseCase(input?: {
  status?: 'inTrial' | 'active';
  currentPeriodEnd?: Date;
}) {
  const subscriptions = new FakeSubscriptionRepository([
    {
      subscription: createSubscription({
        userId,
        plan: 'monthly',
        status: input?.status ?? 'inTrial',
        currentPeriodEnd: input?.currentPeriodEnd ?? trialEndsAt,
      }),
      externalSubscriptionId: 'sub_123',
    },
  ]);
  const stripeCustomers = new FakeStripeCustomerRepository();
  await stripeCustomers.insert(userId, 'cus_123');
  const operations = new FakeTrialPaymentMethodSetupOperationRepository();
  const payments = createPaymentGateway();
  const useCase = new CreateTrialPaymentMethodSetupSessionUseCase(
    subscriptions,
    stripeCustomers,
    operations,
    payments,
    (plan) => ({
      plan,
      amountCents: plan === 'monthly' ? 2900 : 19900,
      currency: 'usd',
      frequency: plan === 'monthly' ? 'month' : 'year',
      disclosureSnapshot: 'Exact renewal disclosure.',
      disclosureVersion: '2026-08-05',
      termsVersion: '2026-08-05',
      termsHash: 'terms-hash',
    }),
    new FakeLogger(),
    () => new Date('2026-08-06T12:00:00Z'),
  );

  return { operations, payments, subscriptions, useCase };
}

describe('CreateTrialPaymentMethodSetupSessionUseCase', () => {
  it('creates a customer-less setup Session and persists the exact pending snapshot', async () => {
    const { operations, payments, useCase } = await createUseCase();

    await expect(
      useCase.execute({
        userId,
        successUrl:
          'https://app.example.com/app/billing?trial_payment_method=success&session_id={CHECKOUT_SESSION_ID}',
        cancelUrl:
          'https://app.example.com/app/billing?trial_payment_method=cancel',
      }),
    ).resolves.toEqual({ url: 'https://stripe/setup' });

    expect(payments.trialSetupInputs).toEqual([
      {
        userId,
        externalCustomerId: 'cus_123',
        externalSubscriptionId: 'sub_123',
        plan: 'monthly',
        amountCents: 2900,
        currency: 'usd',
        frequency: 'month',
        trialEndsAt,
        disclosureSnapshot: 'Exact renewal disclosure.',
        disclosureVersion: '2026-08-05',
        termsVersion: '2026-08-05',
        termsHash: 'terms-hash',
        successUrl:
          'https://app.example.com/app/billing?trial_payment_method=success&session_id={CHECKOUT_SESSION_ID}',
        cancelUrl:
          'https://app.example.com/app/billing?trial_payment_method=cancel',
      },
    ]);
    await expect(operations.findBySessionId('cs_setup_123')).resolves.toEqual(
      expect.objectContaining({
        sessionId: 'cs_setup_123',
        userId,
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
        disclosureSnapshot: 'Exact renewal disclosure.',
        status: 'pending',
      }),
    );
  });

  it('replays the same Session id without changing the pending snapshot', async () => {
    const { operations, useCase } = await createUseCase();
    const input = {
      userId,
      successUrl: 'https://app.example.com/success',
      cancelUrl: 'https://app.example.com/cancel',
    };

    await useCase.execute(input);
    await useCase.execute(input);

    await expect(operations.findBySessionId('cs_setup_123')).resolves.toEqual(
      expect.objectContaining({ status: 'pending' }),
    );
  });

  it('fails closed when the local subscription is not an unexpired trial', async () => {
    const active = await createUseCase({ status: 'active' });
    const expired = await createUseCase({
      currentPeriodEnd: new Date('2026-08-06T11:59:59Z'),
    });
    const input = {
      userId,
      successUrl: 'https://app.example.com/success',
      cancelUrl: 'https://app.example.com/cancel',
    };

    await expect(active.useCase.execute(input)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await expect(expired.useCase.execute(input)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(active.payments.trialSetupInputs).toEqual([]);
    expect(expired.payments.trialSetupInputs).toEqual([]);
  });
});
