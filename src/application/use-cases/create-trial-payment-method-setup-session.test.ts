import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import type { TrialPaymentMethodSetupOperationInput } from '@/src/application/ports/repositories';
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

class FailingSetupOperationRepository extends FakeTrialPaymentMethodSetupOperationRepository {
  override async createPending(
    _input: TrialPaymentMethodSetupOperationInput,
  ): Promise<never> {
    throw new ApplicationError(
      'CONFLICT',
      'raw provider detail user@example.com',
    );
  }
}

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
  operations?: FakeTrialPaymentMethodSetupOperationRepository;
  logger?: FakeLogger;
  /** Without one, the subscription row has no Stripe subscription id. */
  externalSubscriptionId?: string | null;
  /** Without one, the user has no Stripe customer mapping. */
  stripeCustomerId?: string | null;
  /** The plan the renewal terms describe, when not the subscription's. */
  termsPlan?: 'monthly' | 'annual';
  /** Leaves the use case on its default clock, the system clock. */
  systemClock?: boolean;
}) {
  const subscription = createSubscription({
    userId,
    plan: 'monthly',
    status: input?.status ?? 'inTrial',
    currentPeriodEnd: input?.currentPeriodEnd ?? trialEndsAt,
  });
  const externalSubscriptionId =
    input?.externalSubscriptionId === undefined
      ? 'sub_123'
      : input.externalSubscriptionId;
  const subscriptions = new FakeSubscriptionRepository([
    externalSubscriptionId === null
      ? subscription
      : { subscription, externalSubscriptionId },
  ]);
  const stripeCustomers = new FakeStripeCustomerRepository();
  const stripeCustomerId =
    input?.stripeCustomerId === undefined ? 'cus_123' : input.stripeCustomerId;
  if (stripeCustomerId !== null) {
    await stripeCustomers.insert(userId, stripeCustomerId);
  }
  const operations =
    input?.operations ?? new FakeTrialPaymentMethodSetupOperationRepository();
  const logger = input?.logger ?? new FakeLogger();
  const payments = createPaymentGateway();
  const useCase = new CreateTrialPaymentMethodSetupSessionUseCase(
    subscriptions,
    stripeCustomers,
    operations,
    payments,
    (plan) => ({
      plan: input?.termsPlan ?? plan,
      amountCents: plan === 'monthly' ? 2900 : 19900,
      currency: 'usd',
      frequency: plan === 'monthly' ? 'month' : 'year',
      disclosureSnapshot: 'Exact renewal disclosure.',
      disclosureVersion: '2026-08-05',
      termsVersion: '2026-08-05',
      termsHash: 'terms-hash',
      cancellationMethod:
        'Billing page in the app or support@addictionboards.com',
    }),
    logger,
    input?.systemClock ? undefined : () => new Date('2026-08-06T12:00:00Z'),
  );

  return { logger, operations, payments, subscriptions, useCase };
}

describe('CreateTrialPaymentMethodSetupSessionUseCase', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a customer-less setup Session and persists the exact pending snapshot', async () => {
    const { operations, payments, useCase } = await createUseCase();

    await expect(
      useCase.execute({
        userId,
        expectedDisclosureVersion: '2026-08-05',
        email: 'learner@example.com',
        successUrl:
          'https://app.example.com/app/billing?trial_payment_method=success&session_id={CHECKOUT_SESSION_ID}',
        cancelUrl:
          'https://app.example.com/app/billing?trial_payment_method=cancel',
      }),
    ).resolves.toEqual({ url: 'https://stripe/setup' });

    expect(payments.trialSetupInputs).toEqual([
      {
        userId,
        email: 'learner@example.com',
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
        cancellationMethod:
          'Billing page in the app or support@addictionboards.com',
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
        cancellationMethod:
          'Billing page in the app or support@addictionboards.com',
        status: 'pending',
      }),
    );
  });

  it('replays the same Session id without changing the pending snapshot', async () => {
    const { operations, useCase } = await createUseCase();
    const input = {
      userId,
      expectedDisclosureVersion: '2026-08-05',
      email: 'learner@example.com',
      successUrl: 'https://app.example.com/success',
      cancelUrl: 'https://app.example.com/cancel',
    };

    const first = await useCase.execute(input);
    const replay = await useCase.execute(input);

    expect(first).toEqual({ url: 'https://stripe/setup' });
    expect(replay).toEqual(first);

    await expect(operations.findBySessionId('cs_setup_123')).resolves.toEqual({
      sessionId: 'cs_setup_123',
      userId,
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_123',
      plan: 'monthly',
      amountCents: 2900,
      currency: 'usd',
      frequency: 'month',
      trialEndsAt,
      disclosureSnapshot: 'Exact renewal disclosure.',
      disclosureVersion: '2026-08-05',
      termsVersion: '2026-08-05',
      termsHash: 'terms-hash',
      cancellationMethod:
        'Billing page in the app or support@addictionboards.com',
      status: 'pending',
      claimId: null,
      claimedAt: null,
      stripePaymentMethodId: null,
      paymentMethodAttachedAt: null,
      subscriptionDefaultSetAt: null,
      completedAt: null,
      terminalAt: null,
      terminalReason: null,
      expiredAt: null,
    });
  });

  // DEBT-414 F03b: a page loaded before the terms changed must not record
  // consent to text the learner never saw.
  it('refuses before Stripe when the displayed add-card terms are not the current ones', async () => {
    const { operations, payments, useCase } = await createUseCase();

    await expect(
      useCase.execute({
        userId,
        expectedDisclosureVersion: '2026-01-01',
        email: 'learner@example.com',
        successUrl: 'https://app.example.com/app/billing',
        cancelUrl: 'https://app.example.com/app/billing',
      }),
    ).rejects.toEqual(
      new ApplicationError(
        'VALIDATION_ERROR',
        'The displayed add-card terms have changed. Review the current terms before continuing.',
      ),
    );
    expect(payments.trialSetupInputs).toEqual([]);
    await expect(
      operations.findBySessionId('cs_setup_123'),
    ).resolves.toBeNull();
  });

  it('fails closed when the local subscription is not an unexpired trial', async () => {
    const active = await createUseCase({ status: 'active' });
    const expired = await createUseCase({
      currentPeriodEnd: new Date('2026-08-06T11:59:59Z'),
    });
    const expiresNow = await createUseCase({
      currentPeriodEnd: new Date('2026-08-06T12:00:00Z'),
    });
    const input = {
      userId,
      expectedDisclosureVersion: '2026-08-05',
      email: 'learner@example.com',
      successUrl: 'https://app.example.com/success',
      cancelUrl: 'https://app.example.com/cancel',
    };

    await expect(active.useCase.execute(input)).rejects.toEqual(
      new ApplicationError(
        'CONFLICT',
        'An unexpired trial is required to add a payment method',
      ),
    );
    await expect(expired.useCase.execute(input)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await expect(expiresNow.useCase.execute(input)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(active.payments.trialSetupInputs).toEqual([]);
    expect(expired.payments.trialSetupInputs).toEqual([]);
    expect(expiresNow.payments.trialSetupInputs).toEqual([]);
  });

  it('logs only a safe error code when operation persistence fails', async () => {
    const operations = new FailingSetupOperationRepository();
    const logger = new FakeLogger();
    const { useCase } = await createUseCase({ operations, logger });

    await expect(
      useCase.execute({
        userId,
        expectedDisclosureVersion: '2026-08-05',
        email: 'learner@example.com',
        successUrl: 'https://app.example.com/success',
        cancelUrl: 'https://app.example.com/cancel',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    expect(logger.errorCalls).toEqual([
      {
        context: { sessionId: 'cs_setup_123', errorCode: 'CONFLICT' },
        msg: 'Failed to persist trial payment-method setup operation',
      },
    ]);
    expect(JSON.stringify(logger.errorCalls)).not.toContain(
      'raw provider detail user@example.com',
    );
  });

  const setupInput = {
    userId,
    expectedDisclosureVersion: '2026-08-05',
    email: 'learner@example.com',
    successUrl: 'https://app.example.com/success',
    cancelUrl: 'https://app.example.com/cancel',
  };

  it('fails closed when the user has no subscription', async () => {
    const payments = createPaymentGateway();
    const useCase = new CreateTrialPaymentMethodSetupSessionUseCase(
      new FakeSubscriptionRepository(),
      new FakeStripeCustomerRepository(),
      new FakeTrialPaymentMethodSetupOperationRepository(),
      payments,
      () => {
        throw new Error('No renewal terms are needed without a trial');
      },
      new FakeLogger(),
      () => new Date('2026-08-06T12:00:00Z'),
    );

    await expect(useCase.execute(setupInput)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(payments.trialSetupInputs).toEqual([]);
  });

  // Frozen inside the trial, the system clock admits the request; frozen at
  // the trial's end, it refuses it.
  it('reads the system clock when none is injected', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-13T11:59:59Z'));
    const inside = await createUseCase({ systemClock: true });
    await expect(inside.useCase.execute(setupInput)).resolves.toEqual({
      url: 'https://stripe/setup',
    });

    vi.setSystemTime(trialEndsAt);
    const ended = await createUseCase({ systemClock: true });
    await expect(ended.useCase.execute(setupInput)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(ended.payments.trialSetupInputs).toEqual([]);
  });

  it.each([
    ['Stripe subscription id', { externalSubscriptionId: null }],
    ['Stripe customer', { stripeCustomerId: null }],
  ] as const)(
    'fails before Stripe when the trial has no %s',
    async (_missing, identifiers) => {
      const { payments, useCase } = await createUseCase(identifiers);

      await expect(useCase.execute(setupInput)).rejects.toEqual(
        new ApplicationError(
          'INTERNAL_ERROR',
          'Trial billing identifiers are unavailable',
        ),
      );
      expect(payments.trialSetupInputs).toEqual([]);
    },
  );

  // The renewal terms are the disclosure the learner consents to; terms for
  // another plan would disclose the wrong price.
  it('refuses renewal terms for a plan other than the subscription’s', async () => {
    const { payments, useCase } = await createUseCase({ termsPlan: 'annual' });

    await expect(useCase.execute(setupInput)).rejects.toEqual(
      new ApplicationError(
        'INTERNAL_ERROR',
        'Trial renewal terms do not match the subscription plan',
      ),
    );
    expect(payments.trialSetupInputs).toEqual([]);
  });
});
