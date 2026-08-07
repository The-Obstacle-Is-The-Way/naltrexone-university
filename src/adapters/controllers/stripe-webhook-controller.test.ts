// biome-ignore lint/style/noExcessiveLinesPerFile: Keep the Stripe webhook transaction, failure-ledger, and setup-operation concurrency cases in one controller contract suite.
import { describe, expect, it, vi } from 'vitest';
import { STRIPE_SUBSCRIPTION_METADATA_E2E_OWNER_FIELD } from '@/src/adapters/shared/stripe-subscription-errors';
import { ApplicationError } from '@/src/application/errors';
import type { WebhookEventResult } from '@/src/application/ports/gateways';
import {
  FakeLogger,
  FakePaymentGateway,
  FakeRenewalConsentRecordRepository,
  FakeStripeCustomerRepository,
  FakeStripeEventRepository,
  FakeSubscriptionRepository,
  FakeTrialPaymentMethodSetupOperationRepository,
} from '@/src/application/test-helpers/fakes';
import { newRenewalConsentRecord } from '@/src/domain/entities';
import { createSubscription } from '@/src/domain/test-helpers';
import {
  processStripeWebhook,
  type StripeWebhookDeps,
} from './stripe-webhook-controller';

class FailingStripeEventRepository extends FakeStripeEventRepository {
  override async pruneProcessedBefore(
    _cutoff: Date,
    _limit: number,
  ): Promise<number> {
    throw new Error('boom');
  }
}

class FailingSubscriptionRepository extends FakeSubscriptionRepository {
  override async upsert(): Promise<never> {
    throw new Error('boom');
  }
}

class WriteGuardRejectingSubscriptionRepository extends FakeSubscriptionRepository {
  override async upsert() {
    return {
      persisted: false as const,
      reason: 'write_guard_rejected' as const,
      current: createSubscription(),
    };
  }
}

class DriverFailingStripeCustomerRepository extends FakeStripeCustomerRepository {
  override async insert(): Promise<never> {
    const postgresError = Object.assign(
      new Error('duplicate key exposes raw Stripe customer text'),
      {
        code: '23505',
        constraint: 'stripe_customers_stripe_customer_id_unique',
        detail: 'Key (stripe_customer_id)=(cus_raw) already exists',
      },
    );
    throw new ApplicationError(
      'INTERNAL_ERROR',
      'Failed to upsert Stripe customer mapping',
      undefined,
      { cause: postgresError },
    );
  }
}

class ConcurrentlyCompletingStripeEventRepository extends FakeStripeEventRepository {
  override async peek(eventId: string) {
    const snapshot = await super.peek(eventId);
    await this.markProcessed(eventId);
    return snapshot;
  }
}

class LookupFailingSetupOperationRepository extends FakeTrialPaymentMethodSetupOperationRepository {
  override async findBySessionId(): Promise<never> {
    throw new Error('setup operation lookup failed');
  }
}

class ThrowingPaymentGateway extends FakePaymentGateway {
  constructor(private readonly error: unknown) {
    super({
      externalCustomerId: 'cus_test',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_unused',
        type: 'customer.subscription.updated',
      },
    });
  }

  override async processWebhookEvent(): Promise<never> {
    throw this.error;
  }
}

function createDeps(overrides: {
  paymentGateway: FakePaymentGateway;
  stripeEvents?: FakeStripeEventRepository;
  subscriptions?: FakeSubscriptionRepository;
  stripeCustomers?: FakeStripeCustomerRepository;
  logger?: FakeLogger;
  setupOperations?: FakeTrialPaymentMethodSetupOperationRepository;
  renewalConsents?: FakeRenewalConsentRecordRepository;
  now?: () => Date;
}): {
  deps: StripeWebhookDeps;
  stripeEvents: FakeStripeEventRepository;
  subscriptions: FakeSubscriptionRepository;
  stripeCustomers: FakeStripeCustomerRepository;
  logger: FakeLogger;
  setupOperations: FakeTrialPaymentMethodSetupOperationRepository;
  renewalConsents: FakeRenewalConsentRecordRepository;
} {
  const stripeEvents =
    overrides.stripeEvents ?? new FakeStripeEventRepository();
  const subscriptions =
    overrides.subscriptions ?? new FakeSubscriptionRepository();
  const stripeCustomers =
    overrides.stripeCustomers ?? new FakeStripeCustomerRepository();
  const logger = overrides.logger ?? new FakeLogger();
  const setupOperations =
    overrides.setupOperations ??
    new FakeTrialPaymentMethodSetupOperationRepository();
  const renewalConsents =
    overrides.renewalConsents ?? new FakeRenewalConsentRecordRepository();

  return {
    deps: {
      paymentGateway: overrides.paymentGateway,
      subscriptionVersions: subscriptions,
      logger,
      now: overrides.now ?? (() => new Date()),
      transaction: async (fn) =>
        fn({
          stripeEvents,
          subscriptions,
          stripeCustomers,
          trialPaymentMethodSetupOperations: setupOperations,
          renewalConsentRecords: renewalConsents,
        }),
    },
    stripeEvents,
    subscriptions,
    stripeCustomers,
    logger,
    setupOperations,
    renewalConsents,
  };
}

function createRollbackAwareDeps(overrides: {
  paymentGateway: FakePaymentGateway;
  stripeEvents?: FakeStripeEventRepository;
  subscriptions?: FakeSubscriptionRepository;
  stripeCustomers?: FakeStripeCustomerRepository;
  logger?: FakeLogger;
  setupOperations?: FakeTrialPaymentMethodSetupOperationRepository;
  renewalConsents?: FakeRenewalConsentRecordRepository;
  now?: () => Date;
}): {
  deps: StripeWebhookDeps;
  stripeEvents: FakeStripeEventRepository;
  subscriptions: FakeSubscriptionRepository;
  stripeCustomers: FakeStripeCustomerRepository;
  logger: FakeLogger;
  setupOperations: FakeTrialPaymentMethodSetupOperationRepository;
  renewalConsents: FakeRenewalConsentRecordRepository;
} {
  const base = createDeps(overrides);

  return {
    ...base,
    deps: {
      ...base.deps,
      transaction: async (fn) => {
        const StripeEventsCtor = base.stripeEvents
          .constructor as new () => FakeStripeEventRepository;
        const SubscriptionsCtor = base.subscriptions
          .constructor as new () => FakeSubscriptionRepository;
        const StripeCustomersCtor = base.stripeCustomers
          .constructor as new () => FakeStripeCustomerRepository;
        const SetupOperationsCtor = base.setupOperations
          .constructor as new () => FakeTrialPaymentMethodSetupOperationRepository;
        const RenewalConsentsCtor = base.renewalConsents
          .constructor as new () => FakeRenewalConsentRecordRepository;

        const stagingEvents = new StripeEventsCtor();
        const stagingSubscriptions = new SubscriptionsCtor();
        const stagingStripeCustomers = new StripeCustomersCtor();
        const stagingSetupOperations = new SetupOperationsCtor();
        const stagingRenewalConsents = new RenewalConsentsCtor();

        stagingEvents.restore(base.stripeEvents.snapshot());
        stagingSubscriptions.restore(base.subscriptions.snapshot());
        stagingStripeCustomers.restore(base.stripeCustomers.snapshot());
        stagingSetupOperations.restore(base.setupOperations.snapshot());
        stagingRenewalConsents.restore(base.renewalConsents.snapshot());

        const result = await fn({
          stripeEvents: stagingEvents,
          subscriptions: stagingSubscriptions,
          stripeCustomers: stagingStripeCustomers,
          trialPaymentMethodSetupOperations: stagingSetupOperations,
          renewalConsentRecords: stagingRenewalConsents,
        });

        base.stripeEvents.restore(stagingEvents.snapshot());
        base.subscriptions.restore(stagingSubscriptions.snapshot());
        base.stripeCustomers.restore(stagingStripeCustomers.snapshot());
        base.setupOperations.restore(stagingSetupOperations.snapshot());
        base.renewalConsents.restore(stagingRenewalConsents.snapshot());

        return result;
      },
    },
  };
}

function createSubscriptionUpdatePaymentGateway(eventId: string) {
  return new FakePaymentGateway({
    externalCustomerId: 'cus_test',
    checkoutUrl: 'https://stripe/checkout',
    portalUrl: 'https://stripe/portal',
    webhookResult: {
      eventId,
      type: 'customer.subscription.updated',
      subscriptionUpdate: {
        userId: crypto.randomUUID(),
        externalCustomerId: 'cus_123',
        externalSubscriptionId: 'sub_123',
        plan: 'monthly',
        status: 'active',
        currentPeriodEnd: new Date('2026-03-01T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
      },
    },
  });
}

describe('processStripeWebhook', () => {
  it('starts legal retention from a persisted subscription termination', async () => {
    const userId = crypto.randomUUID();
    const renewalConsents = new FakeRenewalConsentRecordRepository();
    await renewalConsents.save(
      newRenewalConsentRecord({
        userId,
        consumerReference: 'a'.repeat(64),
        externalCustomerId: 'cus_123',
        externalSubscriptionId: 'sub_123',
        checkoutSessionId: 'cs_checkout_123',
        setupSessionId: null,
        applicationSourceId: null,
        plan: 'monthly',
        amountCents: 2900,
        currency: 'usd',
        frequency: 'month',
        trialEndsAt: null,
        cancellationDeadline: new Date('2026-09-06T12:00:00Z'),
        cancellationMethod:
          'Billing page in the app or support@addictionboards.com',
        disclosureSnapshot: 'Exact disclosure.',
        disclosureVersion: '2026-08-05',
        termsVersion: '2026-08-05',
        termsHash: 'terms-hash',
        consentSource: 'stripe_checkout',
        acceptedAt: new Date('2026-08-06T12:00:00Z'),
        consentKind: 'initial_offer',
        priorAmountCents: null,
        proposedAmountCents: null,
        effectiveRenewalAt: null,
      }),
    );
    const terminatedAt = new Date('2026-10-06T12:00:00Z');
    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_123',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_subscription_deleted',
        type: 'customer.subscription.deleted',
        occurredAt: terminatedAt,
        subscriptionUpdate: {
          userId,
          externalCustomerId: 'cus_123',
          externalSubscriptionId: 'sub_123',
          plan: 'monthly',
          status: 'canceled',
          currentPeriodEnd: terminatedAt,
          cancelAtPeriodEnd: false,
        },
      },
    });
    const { deps } = createDeps({
      paymentGateway,
      renewalConsents,
      now: () => new Date('2026-10-07T12:00:00Z'),
    });

    await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

    expect(renewalConsents.snapshot()).toEqual([
      expect.objectContaining({
        subscriptionTerminatedAt: terminatedAt,
        retainUntil: new Date('2029-08-06T12:00:00Z'),
      }),
    ]);
  });

  it('persists subscription Checkout consent in the subscription webhook transaction', async () => {
    const userId = crypto.randomUUID();
    const acceptedAt = new Date('2026-08-06T12:00:00Z');
    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_123',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_checkout_consent',
        type: 'checkout.session.completed',
        subscriptionUpdate: {
          userId,
          externalCustomerId: 'cus_123',
          externalSubscriptionId: 'sub_123',
          plan: 'monthly',
          status: 'active',
          currentPeriodEnd: new Date('2026-09-06T12:00:00Z'),
          cancelAtPeriodEnd: false,
        },
        initialSubscriptionConsent: {
          checkoutSessionId: 'cs_checkout_123',
          userId,
          externalCustomerId: 'cus_123',
          externalSubscriptionId: 'sub_123',
          plan: 'monthly',
          amountCents: 2900,
          currency: 'usd',
          frequency: 'month',
          disclosureSnapshot: 'Exact immediate disclosure.',
          disclosureVersion: '2026-08-05',
          termsVersion: '2026-08-05',
          termsHash: 'terms-hash',
          cancellationMethod:
            'Billing page in the app or support@addictionboards.com',
          acceptedAt,
        },
      },
    });
    const { deps, renewalConsents } = createDeps({ paymentGateway });

    await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

    expect(renewalConsents.snapshot()).toEqual([
      expect.objectContaining({
        userId,
        checkoutSessionId: 'cs_checkout_123',
        setupSessionId: null,
        cancellationDeadline: new Date('2026-09-06T12:00:00Z'),
        trialEndsAt: null,
        disclosureSnapshot: 'Exact immediate disclosure.',
        acceptedAt,
      }),
    ]);
  });

  it('does not persist consent when the subscription write guard rejects the update', async () => {
    const userId = crypto.randomUUID();
    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_123',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_checkout_consent_rejected',
        type: 'checkout.session.completed',
        subscriptionUpdate: {
          userId,
          externalCustomerId: 'cus_123',
          externalSubscriptionId: 'sub_123',
          plan: 'monthly',
          status: 'active',
          currentPeriodEnd: new Date('2026-09-06T12:00:00Z'),
          cancelAtPeriodEnd: false,
        },
        initialSubscriptionConsent: {
          checkoutSessionId: 'cs_checkout_rejected',
          userId,
          externalCustomerId: 'cus_123',
          externalSubscriptionId: 'sub_123',
          plan: 'monthly',
          amountCents: 2900,
          currency: 'usd',
          frequency: 'month',
          disclosureSnapshot: 'Exact immediate disclosure.',
          disclosureVersion: '2026-08-05',
          termsVersion: '2026-08-05',
          termsHash: 'terms-hash',
          cancellationMethod:
            'Billing page in the app or support@addictionboards.com',
          acceptedAt: new Date('2026-08-06T12:00:00Z'),
        },
      },
    });
    const subscriptions = new WriteGuardRejectingSubscriptionRepository();
    const { deps, renewalConsents } = createDeps({
      paymentGateway,
      subscriptions,
    });

    await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

    expect(renewalConsents.snapshot()).toEqual([]);
  });

  it('attaches and selects a verified setup payment method after exact local matching', async () => {
    const userId = crypto.randomUUID();
    const completion = {
      sessionId: 'cs_setup_123',
      userId,
      externalCustomerId: 'cus_123',
      externalSubscriptionId: 'sub_123',
      plan: 'monthly' as const,
      amountCents: 2900,
      currency: 'usd' as const,
      frequency: 'month' as const,
      trialEndsAt: new Date('2026-08-13T12:00:00Z'),
      disclosureVersion: '2026-08-05',
      termsVersion: '2026-08-05',
      termsHash: 'terms-hash',
      stripePaymentMethodId: 'pm_123',
      acceptedAt: new Date('2026-08-06T12:00:00Z'),
    };
    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_123',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_setup',
        type: 'checkout.session.completed',
        trialPaymentMethodSetupCompletion: completion,
      },
    });
    const {
      deps,
      subscriptions,
      stripeCustomers,
      setupOperations,
      renewalConsents,
    } = createDeps({ paymentGateway });
    await subscriptions.upsert({
      userId,
      externalSubscriptionId: 'sub_123',
      plan: 'monthly',
      status: 'inTrial',
      currentPeriodEnd: completion.trialEndsAt,
      cancelAtPeriodEnd: false,
      expectedVersion: null,
    });
    await stripeCustomers.insert(userId, 'cus_123');
    await setupOperations.createPending({
      sessionId: completion.sessionId,
      userId,
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_123',
      plan: 'monthly',
      amountCents: 2900,
      currency: 'usd',
      frequency: 'month',
      trialEndsAt: completion.trialEndsAt,
      disclosureSnapshot: 'Exact disclosure.',
      disclosureVersion: '2026-08-05',
      termsVersion: '2026-08-05',
      termsHash: 'terms-hash',
      cancellationMethod:
        'Billing page in the app or support@addictionboards.com',
    });

    await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

    expect(paymentGateway.trialPaymentMethodAttachInputs).toEqual([
      {
        sessionId: 'cs_setup_123',
        externalPaymentMethodId: 'pm_123',
        externalCustomerId: 'cus_123',
      },
    ]);
    expect(paymentGateway.trialSubscriptionDefaultInputs).toEqual([
      {
        sessionId: 'cs_setup_123',
        externalPaymentMethodId: 'pm_123',
        externalSubscriptionId: 'sub_123',
      },
    ]);
    await expect(
      setupOperations.findBySessionId('cs_setup_123'),
    ).resolves.toMatchObject({
      status: 'completed',
      stripePaymentMethodId: 'pm_123',
      paymentMethodAttachedAt: expect.any(Date),
      subscriptionDefaultSetAt: expect.any(Date),
      completedAt: expect.any(Date),
    });
    expect(renewalConsents.snapshot()).toEqual([
      expect.objectContaining({
        userId,
        setupSessionId: 'cs_setup_123',
        checkoutSessionId: null,
        externalSubscriptionId: 'sub_123',
        disclosureSnapshot: 'Exact disclosure.',
        cancellationDeadline: completion.trialEndsAt,
        acceptedAt: completion.acceptedAt,
      }),
    ]);
  });

  it('fails closed when the accepted snapshot differs from the pending operation', async () => {
    const userId = crypto.randomUUID();
    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_123',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_setup_mismatch',
        type: 'checkout.session.completed',
        trialPaymentMethodSetupCompletion: {
          sessionId: 'cs_setup_123',
          userId,
          externalCustomerId: 'cus_123',
          externalSubscriptionId: 'sub_123',
          plan: 'monthly',
          amountCents: 9999,
          currency: 'usd',
          frequency: 'month',
          trialEndsAt: new Date('2026-08-13T12:00:00Z'),
          disclosureVersion: '2026-08-05',
          termsVersion: '2026-08-05',
          termsHash: 'terms-hash',
          stripePaymentMethodId: 'pm_123',
          acceptedAt: new Date('2026-08-06T12:00:00Z'),
        },
      },
    });
    const { deps, subscriptions, stripeCustomers, setupOperations } =
      createDeps({ paymentGateway });
    await subscriptions.upsert({
      userId,
      externalSubscriptionId: 'sub_123',
      plan: 'monthly',
      status: 'inTrial',
      currentPeriodEnd: new Date('2026-08-13T12:00:00Z'),
      cancelAtPeriodEnd: false,
      expectedVersion: null,
    });
    await stripeCustomers.insert(userId, 'cus_123');
    await setupOperations.createPending({
      sessionId: 'cs_setup_123',
      userId,
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_123',
      plan: 'monthly',
      amountCents: 2900,
      currency: 'usd',
      frequency: 'month',
      trialEndsAt: new Date('2026-08-13T12:00:00Z'),
      disclosureSnapshot: 'Exact disclosure.',
      disclosureVersion: '2026-08-05',
      termsVersion: '2026-08-05',
      termsHash: 'terms-hash',
      cancellationMethod:
        'Billing page in the app or support@addictionboards.com',
    });

    await expect(
      processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(paymentGateway.trialPaymentMethodAttachInputs).toEqual([]);
    expect(paymentGateway.trialSubscriptionDefaultInputs).toEqual([]);
  });

  it('reports a missing setup operation before evaluating its snapshot', async () => {
    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_123',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_setup_missing',
        type: 'checkout.session.completed',
        trialPaymentMethodSetupCompletion: {
          sessionId: 'cs_setup_missing',
          userId: crypto.randomUUID(),
          externalCustomerId: 'cus_123',
          externalSubscriptionId: 'sub_123',
          plan: 'monthly',
          amountCents: 2900,
          currency: 'usd',
          frequency: 'month',
          trialEndsAt: new Date('2026-08-13T12:00:00Z'),
          disclosureVersion: '2026-08-05',
          termsVersion: '2026-08-05',
          termsHash: 'terms-hash',
          stripePaymentMethodId: 'pm_123',
          acceptedAt: new Date('2026-08-06T12:00:00Z'),
        },
      },
    });
    const { deps } = createDeps({ paymentGateway });

    await expect(
      processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Trial payment-method setup operation is missing',
    });
  });

  it('preserves an injected setup-operation repository subclass inside staged transactions', async () => {
    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_123',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_setup_lookup_failure',
        type: 'checkout.session.completed',
        trialPaymentMethodSetupCompletion: {
          sessionId: 'cs_setup_lookup_failure',
          userId: crypto.randomUUID(),
          externalCustomerId: 'cus_123',
          externalSubscriptionId: 'sub_123',
          plan: 'monthly',
          amountCents: 2900,
          currency: 'usd',
          frequency: 'month',
          trialEndsAt: new Date('2026-08-13T12:00:00Z'),
          disclosureVersion: '2026-08-05',
          termsVersion: '2026-08-05',
          termsHash: 'terms-hash',
          stripePaymentMethodId: 'pm_123',
          acceptedAt: new Date('2026-08-06T12:00:00Z'),
        },
      },
    });
    const { deps } = createRollbackAwareDeps({
      paymentGateway,
      setupOperations: new LookupFailingSetupOperationRepository(),
    });

    await expect(
      processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
    ).rejects.toThrow('setup operation lookup failed');
  });

  it('fails closed when the signed customer does not match the local user mapping', async () => {
    const userId = crypto.randomUUID();
    const trialEndsAt = new Date('2026-08-13T12:00:00Z');
    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_signed',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_setup_wrong_owner',
        type: 'checkout.session.completed',
        trialPaymentMethodSetupCompletion: {
          sessionId: 'cs_setup_wrong_owner',
          userId,
          externalCustomerId: 'cus_signed',
          externalSubscriptionId: 'sub_123',
          plan: 'monthly',
          amountCents: 2900,
          currency: 'usd',
          frequency: 'month',
          trialEndsAt,
          disclosureVersion: '2026-08-05',
          termsVersion: '2026-08-05',
          termsHash: 'terms-hash',
          stripePaymentMethodId: 'pm_123',
          acceptedAt: new Date('2026-08-06T12:00:00Z'),
        },
      },
    });
    const harness = createDeps({ paymentGateway });
    await harness.subscriptions.upsert({
      userId,
      externalSubscriptionId: 'sub_123',
      plan: 'monthly',
      status: 'inTrial',
      currentPeriodEnd: trialEndsAt,
      cancelAtPeriodEnd: false,
      expectedVersion: null,
    });
    await harness.stripeCustomers.insert(userId, 'cus_other');
    await harness.setupOperations.createPending({
      sessionId: 'cs_setup_wrong_owner',
      userId,
      stripeCustomerId: 'cus_signed',
      stripeSubscriptionId: 'sub_123',
      plan: 'monthly',
      amountCents: 2900,
      currency: 'usd',
      frequency: 'month',
      trialEndsAt,
      disclosureSnapshot: 'Exact disclosure.',
      disclosureVersion: '2026-08-05',
      termsVersion: '2026-08-05',
      termsHash: 'terms-hash',
      cancellationMethod:
        'Billing page in the app or support@addictionboards.com',
    });

    await expect(
      processStripeWebhook(harness.deps, {
        rawBody: 'raw',
        signature: 'sig',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(paymentGateway.trialPaymentMethodAttachInputs).toEqual([]);
    expect(paymentGateway.trialSubscriptionDefaultInputs).toEqual([]);
  });

  it('allows only one of two concurrent deliveries for the same Session to perform provider writes', async () => {
    const userId = crypto.randomUUID();
    let releaseAttach: () => void = () => undefined;
    const attachBarrier = new Promise<void>((resolve) => {
      releaseAttach = resolve;
    });
    let signalAttachStarted: () => void = () => undefined;
    const attachStarted = new Promise<void>((resolve) => {
      signalAttachStarted = resolve;
    });
    class ConcurrentGateway extends FakePaymentGateway {
      private delivery = 0;

      override async processWebhookEvent(): Promise<WebhookEventResult> {
        this.delivery += 1;
        return {
          eventId: `evt_setup_${this.delivery}`,
          type: 'checkout.session.completed',
          trialPaymentMethodSetupCompletion: {
            sessionId: 'cs_setup_concurrent',
            userId,
            externalCustomerId: 'cus_123',
            externalSubscriptionId: 'sub_123',
            plan: 'monthly',
            amountCents: 2900,
            currency: 'usd',
            frequency: 'month',
            trialEndsAt: new Date('2026-08-13T12:00:00Z'),
            disclosureVersion: '2026-08-05',
            termsVersion: '2026-08-05',
            termsHash: 'terms-hash',
            stripePaymentMethodId: 'pm_123',
            acceptedAt: new Date('2026-08-06T12:00:00Z'),
          },
        };
      }

      override async attachTrialPaymentMethod(
        input: Parameters<FakePaymentGateway['attachTrialPaymentMethod']>[0],
      ): Promise<void> {
        await super.attachTrialPaymentMethod(input);
        signalAttachStarted();
        await attachBarrier;
      }
    }
    const paymentGateway = new ConcurrentGateway({
      externalCustomerId: 'cus_123',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: { eventId: 'unused', type: 'charge.refunded' },
    });
    const { deps, subscriptions, stripeCustomers, setupOperations } =
      createDeps({ paymentGateway });
    await subscriptions.upsert({
      userId,
      externalSubscriptionId: 'sub_123',
      plan: 'monthly',
      status: 'inTrial',
      currentPeriodEnd: new Date('2026-08-13T12:00:00Z'),
      cancelAtPeriodEnd: false,
      expectedVersion: null,
    });
    await stripeCustomers.insert(userId, 'cus_123');
    await setupOperations.createPending({
      sessionId: 'cs_setup_concurrent',
      userId,
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_123',
      plan: 'monthly',
      amountCents: 2900,
      currency: 'usd',
      frequency: 'month',
      trialEndsAt: new Date('2026-08-13T12:00:00Z'),
      disclosureSnapshot: 'Exact disclosure.',
      disclosureVersion: '2026-08-05',
      termsVersion: '2026-08-05',
      termsHash: 'terms-hash',
      cancellationMethod:
        'Billing page in the app or support@addictionboards.com',
    });

    const first = processStripeWebhook(deps, {
      rawBody: 'raw-1',
      signature: 'sig-1',
    });
    await attachStarted;
    const second = processStripeWebhook(deps, {
      rawBody: 'raw-2',
      signature: 'sig-2',
    });
    await expect(second).rejects.toMatchObject({ code: 'CONFLICT' });
    releaseAttach();
    await expect(first).resolves.toBeUndefined();

    expect(paymentGateway.trialPaymentMethodAttachInputs).toHaveLength(1);
    expect(paymentGateway.trialSubscriptionDefaultInputs).toHaveLength(1);
  });

  it('resumes after the lease without repeating an already-recorded attach', async () => {
    const userId = crypto.randomUUID();
    let defaultAttempts = 0;
    class OnceFailingDefaultGateway extends FakePaymentGateway {
      override async setTrialSubscriptionDefaultPaymentMethod(
        input: Parameters<
          FakePaymentGateway['setTrialSubscriptionDefaultPaymentMethod']
        >[0],
      ): Promise<void> {
        defaultAttempts += 1;
        if (defaultAttempts === 1) throw new Error('transient');
        await super.setTrialSubscriptionDefaultPaymentMethod(input);
      }
    }
    const paymentGateway = new OnceFailingDefaultGateway({
      externalCustomerId: 'cus_123',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_setup_recovery',
        type: 'checkout.session.completed',
        trialPaymentMethodSetupCompletion: {
          sessionId: 'cs_setup_recovery',
          userId,
          externalCustomerId: 'cus_123',
          externalSubscriptionId: 'sub_123',
          plan: 'monthly',
          amountCents: 2900,
          currency: 'usd',
          frequency: 'month',
          trialEndsAt: new Date('2026-08-13T12:00:00Z'),
          disclosureVersion: '2026-08-05',
          termsVersion: '2026-08-05',
          termsHash: 'terms-hash',
          stripePaymentMethodId: 'pm_123',
          acceptedAt: new Date('2026-08-06T12:00:00Z'),
        },
      },
    });
    const harness = createDeps({ paymentGateway });
    let now = new Date('2026-08-06T12:00:00Z');
    harness.deps.now = () => now;
    await harness.subscriptions.upsert({
      userId,
      externalSubscriptionId: 'sub_123',
      plan: 'monthly',
      status: 'inTrial',
      currentPeriodEnd: new Date('2026-08-13T12:00:00Z'),
      cancelAtPeriodEnd: false,
      expectedVersion: null,
    });
    await harness.stripeCustomers.insert(userId, 'cus_123');
    await harness.setupOperations.createPending({
      sessionId: 'cs_setup_recovery',
      userId,
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_123',
      plan: 'monthly',
      amountCents: 2900,
      currency: 'usd',
      frequency: 'month',
      trialEndsAt: new Date('2026-08-13T12:00:00Z'),
      disclosureSnapshot: 'Exact disclosure.',
      disclosureVersion: '2026-08-05',
      termsVersion: '2026-08-05',
      termsHash: 'terms-hash',
      cancellationMethod:
        'Billing page in the app or support@addictionboards.com',
    });

    await expect(
      processStripeWebhook(harness.deps, {
        rawBody: 'raw',
        signature: 'sig',
      }),
    ).rejects.toThrow('transient');
    now = new Date('2026-08-06T12:06:00Z');
    await expect(
      processStripeWebhook(harness.deps, {
        rawBody: 'raw',
        signature: 'sig',
      }),
    ).resolves.toBeUndefined();

    expect(paymentGateway.trialPaymentMethodAttachInputs).toHaveLength(1);
    expect(defaultAttempts).toBe(2);
    expect(paymentGateway.trialSubscriptionDefaultInputs).toHaveLength(1);
    await expect(
      harness.setupOperations.findBySessionId('cs_setup_recovery'),
    ).resolves.toMatchObject({ status: 'completed' });
  });

  it('skips subscription webhooks that are missing metadata.user_id', async () => {
    const paymentGateway = new ThrowingPaymentGateway(
      new ApplicationError(
        'STRIPE_ERROR',
        'Stripe subscription metadata.user_id is required',
        {
          'metadata.user_id': ['required'],
        },
      ),
    );

    const { deps, stripeEvents, logger } = createDeps({ paymentGateway });

    await expect(
      processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
    ).resolves.toBeUndefined();

    expect(stripeEvents.snapshot()).toEqual([]);
    expect(logger.warnCalls).toContainEqual({
      context: expect.objectContaining({
        reason: 'metadata_missing',
        code: 'STRIPE_ERROR',
        fieldErrors: {
          'metadata.user_id': ['required'],
        },
      }),
      msg: 'Skipping Stripe subscription webhook with missing metadata.user_id',
    });
  });

  it('skips subscription webhooks whose e2e owner differs from this webhook owner', async () => {
    const paymentGateway = new ThrowingPaymentGateway(
      new ApplicationError(
        'STRIPE_ERROR',
        'Stripe subscription metadata.e2e_owner does not match this webhook owner',
        {
          [STRIPE_SUBSCRIPTION_METADATA_E2E_OWNER_FIELD]: ['mismatch'],
        },
      ),
    );

    const { deps, stripeEvents, logger } = createDeps({ paymentGateway });

    await expect(
      processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
    ).resolves.toBeUndefined();

    expect(stripeEvents.snapshot()).toEqual([]);
    expect(logger.warnCalls).toContainEqual({
      context: expect.objectContaining({
        reason: 'e2e_owner_mismatch',
        code: 'STRIPE_ERROR',
        fieldErrors: {
          [STRIPE_SUBSCRIPTION_METADATA_E2E_OWNER_FIELD]: ['mismatch'],
        },
      }),
      msg: 'Skipping Stripe subscription webhook from a different E2E owner',
    });
  });

  it('continues to throw unrelated Stripe processing errors', async () => {
    const paymentGateway = new ThrowingPaymentGateway(
      new ApplicationError(
        'STRIPE_ERROR',
        'Stripe subscription price id does not match a configured plan',
      ),
    );

    const { deps, stripeEvents, logger } = createDeps({ paymentGateway });

    await expect(
      processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
    ).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
      message: 'Stripe subscription price id does not match a configured plan',
    });

    expect(stripeEvents.snapshot()).toEqual([]);
    expect(logger.warnCalls).toEqual([]);
  });

  it('claims, processes, and marks subscription events idempotently', async () => {
    const userId = crypto.randomUUID();
    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_test',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_1',
        type: 'customer.subscription.updated',
        subscriptionUpdate: {
          userId,
          externalCustomerId: 'cus_123',
          externalSubscriptionId: 'sub_123',
          plan: 'monthly',
          status: 'active',
          currentPeriodEnd: new Date('2026-03-01T00:00:00.000Z'),
          cancelAtPeriodEnd: false,
        },
      },
    });

    const { deps, subscriptions, stripeCustomers } = createDeps({
      paymentGateway,
    });
    const insertSpy = vi.spyOn(stripeCustomers, 'insert');

    await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

    await expect(subscriptions.findByUserId(userId)).resolves.toMatchObject({
      userId,
      plan: 'monthly',
      status: 'active',
    });
    await expect(
      subscriptions.findByExternalSubscriptionId('sub_123'),
    ).resolves.toMatchObject({
      userId,
    });
    expect(insertSpy).toHaveBeenCalledTimes(1);

    // Second delivery of the same event should short-circuit (no double upsert).
    await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

    expect(insertSpy).toHaveBeenCalledTimes(1);
  });

  it('does not let a superseded terminal subscription webhook overwrite a current active row', async () => {
    const userId = crypto.randomUUID();
    const now = new Date('2026-06-12T00:00:00.000Z');
    const subscriptions = new FakeSubscriptionRepository([], () => now);
    await subscriptions.upsert({
      userId,
      externalSubscriptionId: 'sub_current',
      plan: 'monthly',
      status: 'active',
      currentPeriodEnd: new Date('2026-06-13T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
      expectedVersion: null,
    });
    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_test',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_superseded_canceled',
        type: 'customer.subscription.deleted',
        subscriptionUpdate: {
          userId,
          externalCustomerId: 'cus_123',
          externalSubscriptionId: 'sub_superseded',
          plan: 'monthly',
          status: 'canceled',
          currentPeriodEnd: new Date('2026-06-01T00:00:00.000Z'),
          cancelAtPeriodEnd: false,
        },
      },
    });

    const { deps, stripeEvents, stripeCustomers } = createDeps({
      paymentGateway,
      subscriptions,
    });

    await expect(
      processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
    ).resolves.toBeUndefined();

    await expect(
      subscriptions.findByExternalSubscriptionId('sub_current'),
    ).resolves.toMatchObject({
      userId,
      status: 'active',
      currentPeriodEnd: new Date('2026-06-13T00:00:00.000Z'),
    });
    await expect(
      subscriptions.findByExternalSubscriptionId('sub_superseded'),
    ).resolves.toBeNull();
    await expect(
      stripeEvents.lock('evt_superseded_canceled'),
    ).resolves.toMatchObject({
      processedAt: expect.any(Date),
      error: null,
    });
    await expect(stripeCustomers.findByUserId(userId)).resolves.toBeNull();
  });

  it('does not let a different unpaid subscription webhook overwrite a current active row', async () => {
    const userId = crypto.randomUUID();
    const now = new Date('2026-06-12T00:00:00.000Z');
    const subscriptions = new FakeSubscriptionRepository([], () => now);
    await subscriptions.upsert({
      userId,
      externalSubscriptionId: 'sub_current',
      plan: 'monthly',
      status: 'active',
      currentPeriodEnd: new Date('2026-06-13T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
      expectedVersion: null,
    });
    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_test',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_duplicate_unpaid',
        type: 'customer.subscription.updated',
        subscriptionUpdate: {
          userId,
          externalCustomerId: 'cus_123',
          externalSubscriptionId: 'sub_unpaid',
          plan: 'monthly',
          status: 'unpaid',
          currentPeriodEnd: new Date('2026-07-13T00:00:00.000Z'),
          cancelAtPeriodEnd: false,
        },
      },
    });

    const { deps, stripeEvents, stripeCustomers } = createDeps({
      paymentGateway,
      subscriptions,
    });

    await expect(
      processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
    ).resolves.toBeUndefined();

    await expect(
      subscriptions.findByExternalSubscriptionId('sub_current'),
    ).resolves.toMatchObject({
      userId,
      status: 'active',
      currentPeriodEnd: new Date('2026-06-13T00:00:00.000Z'),
    });
    await expect(
      subscriptions.findByExternalSubscriptionId('sub_unpaid'),
    ).resolves.toBeNull();
    await expect(
      stripeEvents.lock('evt_duplicate_unpaid'),
    ).resolves.toMatchObject({
      processedAt: expect.any(Date),
      error: null,
    });
    await expect(stripeCustomers.findByUserId(userId)).resolves.toBeNull();
  });

  it('marks non-subscription events as processed (no subscription update)', async () => {
    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_test',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_2',
        type: 'checkout.session.completed',
      },
    });

    const { deps, stripeEvents } = createDeps({ paymentGateway });

    await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

    await expect(stripeEvents.lock('evt_2')).resolves.toMatchObject({
      processedAt: expect.any(Date),
      error: null,
    });
  });

  it('updates stale stripe customer mappings in webhook context instead of failing', async () => {
    const userId = crypto.randomUUID();
    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_test',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_customer_remap',
        type: 'customer.subscription.updated',
        subscriptionUpdate: {
          userId,
          externalCustomerId: 'cus_new',
          externalSubscriptionId: 'sub_123',
          plan: 'monthly',
          status: 'active',
          currentPeriodEnd: new Date('2026-03-01T00:00:00.000Z'),
          cancelAtPeriodEnd: false,
        },
      },
    });

    const { deps, stripeCustomers } = createDeps({ paymentGateway });
    await stripeCustomers.insert(userId, 'cus_old');

    await expect(
      processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
    ).resolves.toBeUndefined();

    await expect(stripeCustomers.findByUserId(userId)).resolves.toEqual({
      stripeCustomerId: 'cus_new',
    });
  });

  it('prunes old processed stripe events after successful processing', async () => {
    vi.useFakeTimers();
    try {
      const now = new Date('2026-02-01T00:00:00Z');
      vi.setSystemTime(now);

      const paymentGateway = new FakePaymentGateway({
        externalCustomerId: 'cus_test',
        checkoutUrl: 'https://stripe/checkout',
        portalUrl: 'https://stripe/portal',
        webhookResult: {
          eventId: 'evt_prune',
          type: 'checkout.session.completed',
        },
      });

      const { deps, stripeEvents } = createDeps({ paymentGateway });
      const pruneSpy = vi.spyOn(stripeEvents, 'pruneProcessedBefore');

      await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

      const ninetyDaysMs = 86_400_000 * 90;
      expect(pruneSpy).toHaveBeenCalledWith(
        new Date(now.getTime() - ninetyDaysMs),
        100,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not call Date.now when computing stripe prune cutoff', async () => {
    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_test',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_prune_clock_injection',
        type: 'checkout.session.completed',
      },
    });

    const { deps } = createDeps({ paymentGateway });
    const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('Date.now should not be used in processStripeWebhook');
    });

    try {
      await expect(
        processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
      ).resolves.toBeUndefined();
      expect(dateNowSpy).not.toHaveBeenCalled();
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it('logs a warning when pruning processed stripe events fails', async () => {
    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_test',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_prune_fail',
        type: 'checkout.session.completed',
      },
    });

    const stripeEvents = new FailingStripeEventRepository();
    const { deps, logger } = createDeps({ paymentGateway, stripeEvents });

    await expect(
      processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
    ).resolves.toBeUndefined();

    expect(logger.warnCalls).toContainEqual({
      context: expect.objectContaining({
        eventId: 'evt_prune_fail',
        error: { name: 'Error' },
      }),
      msg: 'Stripe event pruning failed',
    });
    expect(JSON.stringify(logger.warnCalls)).not.toContain('boom');
  });

  it('still succeeds when pruning processed stripe events fails', async () => {
    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_test',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_prune_fail_2',
        type: 'checkout.session.completed',
      },
    });

    const stripeEvents = new FailingStripeEventRepository();
    const { deps } = createDeps({ paymentGateway, stripeEvents });

    await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

    await expect(stripeEvents.lock('evt_prune_fail_2')).resolves.toMatchObject({
      processedAt: expect.any(Date),
      error: null,
    });
  });

  it('isolates Stripe-event and renewal-consent pruning in separate transactions', async () => {
    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_test',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_prune_transaction_isolation',
        type: 'checkout.session.completed',
      },
    });
    const { deps } = createDeps({ paymentGateway });
    const originalTransaction = deps.transaction;
    let transactionCount = 0;
    deps.transaction = async (fn) => {
      transactionCount += 1;
      return originalTransaction(fn);
    };

    await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

    expect(transactionCount).toBe(3);
  });

  it('returns early when the event was already processed', async () => {
    const userId = crypto.randomUUID();
    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_test',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_3',
        type: 'customer.subscription.updated',
        subscriptionUpdate: {
          userId,
          externalCustomerId: 'cus_123',
          externalSubscriptionId: 'sub_123',
          plan: 'monthly',
          status: 'active',
          currentPeriodEnd: new Date('2026-03-01T00:00:00.000Z'),
          cancelAtPeriodEnd: false,
        },
      },
    });

    const stripeEvents = new FakeStripeEventRepository();
    await stripeEvents.claim('evt_3', 'customer.subscription.updated');
    await stripeEvents.markProcessed('evt_3');
    const lockSpy = vi.spyOn(stripeEvents, 'lock');

    const { deps, stripeCustomers } = createDeps({
      paymentGateway,
      stripeEvents,
    });
    const insertSpy = vi.spyOn(stripeCustomers, 'insert');

    await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

    expect(insertSpy).not.toHaveBeenCalled();
    expect(lockSpy).not.toHaveBeenCalled();
  });

  it('does not reprocess an event completed between peek and lock', async () => {
    const userId = crypto.randomUUID();
    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_test',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_concurrent_completion',
        type: 'customer.subscription.updated',
        subscriptionUpdate: {
          userId,
          externalCustomerId: 'cus_123',
          externalSubscriptionId: 'sub_123',
          plan: 'monthly',
          status: 'active',
          currentPeriodEnd: new Date('2026-03-01T00:00:00.000Z'),
          cancelAtPeriodEnd: false,
        },
      },
    });
    const stripeEvents = new ConcurrentlyCompletingStripeEventRepository();
    await stripeEvents.claim(
      'evt_concurrent_completion',
      'customer.subscription.updated',
    );
    const { deps, subscriptions } = createDeps({
      paymentGateway,
      stripeEvents,
    });
    const upsertSpy = vi.spyOn(subscriptions, 'upsert');

    await expect(
      processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
    ).resolves.toBeUndefined();

    expect(upsertSpy).not.toHaveBeenCalled();
    await expect(
      stripeEvents.lock('evt_concurrent_completion'),
    ).resolves.toMatchObject({
      processedAt: expect.any(Date),
      error: null,
    });
  });

  it('returns call to prune processed stripe events when event already processed', async () => {
    vi.useFakeTimers();
    try {
      const now = new Date('2026-02-01T00:00:00Z');
      vi.setSystemTime(now);

      const paymentGateway = new FakePaymentGateway({
        externalCustomerId: 'cus_test',
        checkoutUrl: 'https://stripe/checkout',
        portalUrl: 'https://stripe/portal',
        webhookResult: {
          eventId: 'evt_already_processed_prune',
          type: 'checkout.session.completed',
        },
      });

      const stripeEvents = new FakeStripeEventRepository();
      await stripeEvents.claim(
        'evt_already_processed_prune',
        'checkout.session.completed',
      );
      await stripeEvents.markProcessed('evt_already_processed_prune');

      const { deps } = createDeps({ paymentGateway, stripeEvents });
      const pruneSpy = vi.spyOn(stripeEvents, 'pruneProcessedBefore');

      await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

      const ninetyDaysMs = 86_400_000 * 90;
      expect(pruneSpy).toHaveBeenCalledWith(
        new Date(now.getTime() - ninetyDaysMs),
        100,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('persists failure state even when the transaction would rollback on throw', async () => {
    const paymentGateway = createSubscriptionUpdatePaymentGateway(
      'evt_rollback_failure_state',
    );

    const subscriptions = new FailingSubscriptionRepository();
    const { deps, stripeEvents } = createRollbackAwareDeps({
      paymentGateway,
      subscriptions,
    });

    await expect(
      processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
    ).rejects.toMatchObject({ message: 'boom' });

    await expect(
      stripeEvents.lock('evt_rollback_failure_state'),
    ).resolves.toMatchObject({
      processedAt: null,
      error: expect.any(String),
    });
  });

  it('persists only safe driver diagnostics for a failed Stripe event', async () => {
    const paymentGateway = createSubscriptionUpdatePaymentGateway(
      'evt_safe_driver_diagnostics',
    );
    const stripeCustomers = new DriverFailingStripeCustomerRepository();
    const { deps, stripeEvents } = createRollbackAwareDeps({
      paymentGateway,
      stripeCustomers,
    });

    await expect(
      processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });

    const stored = await stripeEvents.lock('evt_safe_driver_diagnostics');
    const diagnostics = JSON.parse(stored.error ?? '{}');
    expect(diagnostics).toEqual({
      name: 'ApplicationError',
      code: 'INTERNAL_ERROR',
      sqlState: '23505',
      constraint: 'stripe_customers_stripe_customer_id_unique',
    });
    expect(stored.error).not.toContain('raw Stripe customer');
    expect(stored.error).not.toContain('cus_raw');
  });

  it('marks the event failed when processing throws', async () => {
    const paymentGateway = createSubscriptionUpdatePaymentGateway('evt_4');

    const subscriptions = new FailingSubscriptionRepository();
    const { deps, stripeEvents } = createDeps({
      paymentGateway,
      subscriptions,
    });

    await expect(
      processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
    ).rejects.toMatchObject({ message: 'boom' });

    const stored = await stripeEvents.lock('evt_4');

    expect(stored).toMatchObject({
      processedAt: null,
      error: expect.any(String),
    });

    const errorData = JSON.parse(stored.error ?? '{}') as Record<
      string,
      unknown
    >;
    expect(errorData).toEqual({
      name: 'Error',
    });
    expect(stored.error).not.toContain('boom');
  });
});
