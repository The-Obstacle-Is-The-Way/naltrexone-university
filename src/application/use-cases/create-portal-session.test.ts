import { describe, expect, it } from 'vitest';
import { createSubscription } from '@/src/domain/test-helpers';
import type { SubscriptionStatus } from '@/src/domain/value-objects';
import { ApplicationError } from '../errors';
import {
  FakePaymentGateway,
  FakeStripeCustomerRepository,
  FakeSubscriptionRepository,
} from '../test-helpers/fakes';
import { CreatePortalSessionUseCase } from './create-portal-session';

const userId = '11111111-1111-4111-8111-111111111111';

function createPayments() {
  return new FakePaymentGateway({
    externalCustomerId: 'cus_new',
    checkoutUrl: 'https://stripe/checkout',
    portalUrl: 'https://stripe/portal',
    webhookResult: { eventId: 'evt_1', type: 'checkout.session.completed' },
  });
}

async function openPortal(
  status: SubscriptionStatus | null,
  idempotencyKey?: string,
) {
  const payments = createPayments();
  const stripeCustomers = new FakeStripeCustomerRepository();
  await stripeCustomers.insert(userId, 'cus_existing');
  const subscriptions = new FakeSubscriptionRepository(
    status === null ? [] : [createSubscription({ userId, status })],
  );
  const useCase = new CreatePortalSessionUseCase(
    stripeCustomers,
    subscriptions,
    payments,
  );

  const result = await useCase.execute({
    userId,
    returnUrl: 'https://app.example.com/app/billing',
    ...(idempotencyKey ? { idempotencyKey } : {}),
  });
  return { payments, result };
}

describe('CreatePortalSessionUseCase', () => {
  it('throws NOT_FOUND when the user has no Stripe customer mapping', async () => {
    const payments = createPayments();

    const useCase = new CreatePortalSessionUseCase(
      new FakeStripeCustomerRepository(),
      new FakeSubscriptionRepository(),
      payments,
    );

    await expect(
      useCase.execute({
        userId,
        returnUrl: 'https://app.example.com/app/billing',
      }),
    ).rejects.toEqual(
      new ApplicationError('NOT_FOUND', 'Stripe customer not found'),
    );
    expect(payments.portalInputs).toEqual([]);
  });

  it('passes a request key to the gateway, and no request options without one', async () => {
    const keyed = await openPortal('active', 'portal-key-1');
    const unkeyed = await openPortal('active');

    expect(keyed.payments.portalOptions).toStrictEqual([
      { idempotencyKey: 'portal-key-1' },
    ]);
    expect(unkeyed.payments.portalOptions).toStrictEqual([undefined]);
  });

  it('creates a paid-profile portal session for a paying subscriber', async () => {
    const { payments, result } = await openPortal('active');

    expect(result).toEqual({ url: 'https://stripe/portal' });
    expect(payments.portalInputs).toEqual([
      {
        externalCustomerId: 'cus_existing',
        returnUrl: 'https://app.example.com/app/billing',
        profile: 'paid',
      },
    ]);
  });

  // DEBT-414 F05: during a trial the only way to add a first card is the
  // add-card flow, which records the learner's consent to be charged.
  it('opens the trial profile, without payment-method changes, during a trial', async () => {
    const { payments } = await openPortal('inTrial');

    expect(payments.portalInputs).toMatchObject([{ profile: 'trial' }]);
  });

  it('fails closed to the trial profile before any subscription is recorded', async () => {
    const { payments } = await openPortal(null);

    expect(payments.portalInputs).toMatchObject([{ profile: 'trial' }]);
  });

  it.each([
    'paymentProcessing',
    'paymentFailed',
    'canceled',
    'unpaid',
    'paused',
    'pastDue',
  ] as const)(
    'opens the paid profile for a %s subscription',
    async (status) => {
      const { payments } = await openPortal(status);

      expect(payments.portalInputs).toMatchObject([{ profile: 'paid' }]);
    },
  );
});
