import { describe, expect, it } from 'vitest';
import type { WebhookEventResult } from '@/src/application/ports';
import {
  FakeLogger,
  FakePaymentGateway,
  FakeRenewalConsentRecordRepository,
  FakeRenewalNoticeDeliveryRepository,
  FakeSha256Hasher,
  FakeStripeCustomerRepository,
  FakeStripeEventRepository,
  FakeSubscriptionRepository,
  FakeTransactionalEmailGateway,
  FakeTrialPaymentMethodSetupOperationRepository,
} from '@/src/application/test-helpers/fakes';
import { DispatchRenewalNoticeDeliveryUseCase } from '@/src/application/use-cases';
import type { NewRenewalNoticeDelivery } from '@/src/domain/entities';
import {
  processStripeWebhook,
  type StripeWebhookDeps,
  type StripeWebhookTransaction,
} from './stripe-webhook-controller';

const now = new Date('2026-08-07T12:00:00.000Z');

class ObservingDeliveryRepository extends FakeRenewalNoticeDeliveryRepository {
  savedDuringTransaction: boolean | null = null;

  constructor(
    hasher: FakeSha256Hasher,
    private readonly isTransactionActive: () => boolean,
  ) {
    super(() => now, hasher);
  }

  override async saveQueued(input: NewRenewalNoticeDelivery) {
    this.savedDuringTransaction = this.isTransactionActive();
    return super.saveQueued(input);
  }
}

function checkoutEvent(userId: string) {
  return {
    eventId: 'evt_checkout_ack',
    type: 'checkout.session.completed',
    subscriptionUpdate: {
      userId,
      externalCustomerId: 'cus_123',
      externalSubscriptionId: 'sub_123',
      plan: 'monthly' as const,
      status: 'active' as const,
      currentPeriodEnd: new Date('2026-09-07T12:00:00.000Z'),
      cancelAtPeriodEnd: false,
    },
    initialSubscriptionConsent: {
      checkoutSessionId: 'cs_123',
      userId,
      externalCustomerId: 'cus_123',
      externalSubscriptionId: 'sub_123',
      plan: 'monthly' as const,
      amountCents: 2900,
      currency: 'usd' as const,
      frequency: 'month' as const,
      disclosureSnapshot: 'Renews monthly at $29 until canceled.',
      disclosureVersion: '2026-08-05',
      termsVersion: '2026-08-05',
      termsHash: 'terms-hash',
      cancellationMethod:
        'Cancel on the Billing page in the app or email support@addictionboards.com.',
      acceptedAt: new Date('2026-08-07T11:55:00.000Z'),
    },
  };
}

function createHarness(input?: {
  configured?: boolean;
  clearConsentUserReference?: boolean;
  dispatchError?: Error;
  findUserById?: StripeWebhookTransaction['users']['findById'];
  userId?: string;
  webhookResult?: WebhookEventResult;
  providerResult?:
    | { status: 'delivered'; providerEventId: string }
    | { status: 'transient_failure'; failureCode: string };
}) {
  const userId = input?.userId ?? crypto.randomUUID();
  const stripeEvents = new FakeStripeEventRepository();
  const subscriptions = new FakeSubscriptionRepository();
  const stripeCustomers = new FakeStripeCustomerRepository();
  const setupOperations = new FakeTrialPaymentMethodSetupOperationRepository();
  const renewalConsents = new FakeRenewalConsentRecordRepository();
  const hasher = new FakeSha256Hasher();
  let transactionActive = false;
  const renewalDeliveries = new ObservingDeliveryRepository(
    hasher,
    () => transactionActive,
  );
  let providerObservedTransactionActive: boolean | null = null;
  const emailGatewayInput = {
    configured: input?.configured ?? true,
    onSend: () => {
      providerObservedTransactionActive = transactionActive;
    },
    ...(input?.providerResult ? { results: [input.providerResult] } : {}),
  };
  const emailGateway = new FakeTransactionalEmailGateway(emailGatewayInput);
  const paymentGateway = new FakePaymentGateway({
    externalCustomerId: 'cus_123',
    checkoutUrl: 'https://stripe/checkout',
    portalUrl: 'https://stripe/portal',
    webhookResult: input?.webhookResult ?? checkoutEvent(userId),
  });
  const providerDispatch = new DispatchRenewalNoticeDeliveryUseCase(
    renewalDeliveries,
    emailGateway,
    hasher,
    new FakeLogger(),
    () => now,
    () => 'attempt-1',
  );
  const dispatch = {
    execute: async (dispatchInput: { deliveryId: string }) => {
      if (input?.dispatchError) throw input.dispatchError;
      return providerDispatch.execute(dispatchInput);
    },
  };
  const logger = new FakeLogger();
  const deps: StripeWebhookDeps = {
    paymentGateway,
    subscriptionVersions: subscriptions,
    logger,
    now: () => now,
    appUrl: 'https://addictionboards.com',
    sha256Hasher: hasher,
    dispatchRenewalNoticeDelivery: dispatch,
    transaction: async (fn) => {
      transactionActive = true;
      try {
        return await fn({
          stripeEvents,
          subscriptions,
          stripeCustomers,
          trialPaymentMethodSetupOperations: setupOperations,
          renewalConsentRecords: {
            ...renewalConsents,
            save: async (...args: Parameters<typeof renewalConsents.save>) => {
              const saved = await renewalConsents.save(...args);
              if (!input?.clearConsentUserReference) return saved;
              const savedUserId = saved.userId;
              if (savedUserId) renewalConsents.clearUserReference(savedUserId);
              const userless = await renewalConsents.findById(saved.id);
              if (!userless) throw new Error('expected saved consent');
              return userless;
            },
            findById: renewalConsents.findById.bind(renewalConsents),
            findBySource: renewalConsents.findBySource.bind(renewalConsents),
            markSubscriptionTerminated:
              renewalConsents.markSubscriptionTerminated.bind(renewalConsents),
            pruneExpired: renewalConsents.pruneExpired.bind(renewalConsents),
          },
          renewalNoticeDeliveries: renewalDeliveries,
          users: {
            findById:
              input?.findUserById ??
              (async (id: string) => ({
                id,
                email: 'subscriber@example.com',
                createdAt: now,
                updatedAt: now,
              })),
          },
        });
      } finally {
        transactionActive = false;
      }
    },
  };

  return {
    deps,
    emailGateway,
    logger,
    paymentGateway,
    providerObservedTransactionActive: () => providerObservedTransactionActive,
    renewalConsents,
    renewalDeliveries,
    setupOperations,
    stripeCustomers,
    subscriptions,
    userId,
  };
}

describe('Stripe webhook renewal acknowledgment', () => {
  it('commits the consent and acknowledgment together before provider dispatch', async () => {
    const harness = createHarness();

    await processStripeWebhook(harness.deps, {
      rawBody: 'raw',
      signature: 'sig',
    });

    expect(harness.renewalConsents.snapshot()).toHaveLength(1);
    expect(harness.renewalDeliveries.records).toEqual([
      expect.objectContaining({
        noticeKind: 'acknowledgment',
        consentRecordId: harness.renewalConsents.snapshot()[0]?.id,
        destination: 'subscriber@example.com',
        status: 'delivered',
      }),
    ]);
    expect(harness.renewalDeliveries.savedDuringTransaction).toBe(true);
    expect(harness.providerObservedTransactionActive()).toBe(false);
    expect(harness.emailGateway.sendInputs).toHaveLength(1);
  });

  it('keeps verified consent and the queued acknowledgment when Resend is unconfigured', async () => {
    const harness = createHarness({ configured: false });

    await processStripeWebhook(harness.deps, {
      rawBody: 'raw',
      signature: 'sig',
    });

    expect(harness.renewalConsents.snapshot()).toHaveLength(1);
    expect(harness.renewalDeliveries.records).toEqual([
      expect.objectContaining({ status: 'queued', attemptCount: 0 }),
    ]);
    expect(harness.emailGateway.sendInputs).toEqual([]);
  });

  it('does not roll back consent when the provider returns a transient failure', async () => {
    const harness = createHarness({
      providerResult: {
        status: 'transient_failure',
        failureCode: 'rate_limit_exceeded',
      },
    });

    await processStripeWebhook(harness.deps, {
      rawBody: 'raw',
      signature: 'sig',
    });

    expect(harness.renewalConsents.snapshot()).toHaveLength(1);
    expect(harness.renewalDeliveries.records).toEqual([
      expect.objectContaining({
        status: 'transient_failure',
        failureCode: 'rate_limit_exceeded',
      }),
    ]);
  });

  it('fails closed when a persisted initial consent has no local user reference', async () => {
    const harness = createHarness({ clearConsentUserReference: true });

    await expect(
      processStripeWebhook(harness.deps, { rawBody: 'raw', signature: 'sig' }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Initial renewal consent is missing its local user',
    });
    expect(harness.emailGateway.sendInputs).toEqual([]);
  });

  it('fails closed when the acknowledgment recipient no longer exists', async () => {
    const harness = createHarness({ findUserById: async () => null });

    await expect(
      processStripeWebhook(harness.deps, { rawBody: 'raw', signature: 'sig' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Renewal acknowledgment recipient not found',
    });
    expect(harness.emailGateway.sendInputs).toEqual([]);
  });

  it('keeps committed consent and acknowledgment when post-commit dispatch throws', async () => {
    const harness = createHarness({
      dispatchError: new Error('provider unavailable'),
    });

    await expect(
      processStripeWebhook(harness.deps, { rawBody: 'raw', signature: 'sig' }),
    ).resolves.toBeUndefined();
    expect(harness.renewalConsents.snapshot()).toHaveLength(1);
    expect(harness.renewalDeliveries.records).toEqual([
      expect.objectContaining({ status: 'queued' }),
    ]);
    expect(harness.logger.errorCalls).toContainEqual({
      context: {
        eventId: 'evt_checkout_ack',
        error: { name: 'Error' },
      },
      msg: 'Renewal acknowledgment dispatch failed',
    });
  });

  it('queues the setup-mode acknowledgment only after the verified setup completion', async () => {
    const trialEndsAt = new Date('2026-08-14T12:00:00.000Z');
    const userId = crypto.randomUUID();
    const harness = createHarness({
      configured: false,
      userId,
      webhookResult: {
        eventId: 'evt_setup_ack',
        type: 'checkout.session.completed',
        trialPaymentMethodSetupCompletion: {
          sessionId: 'cs_setup_123',
          userId,
          externalCustomerId: 'cus_123',
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
          acceptedAt: now,
        },
      },
    });
    await harness.subscriptions.upsert({
      userId: harness.userId,
      externalSubscriptionId: 'sub_123',
      plan: 'monthly',
      status: 'inTrial',
      currentPeriodEnd: trialEndsAt,
      cancelAtPeriodEnd: false,
      expectedVersion: null,
    });
    await harness.stripeCustomers.insert(harness.userId, 'cus_123');
    await harness.setupOperations.createPending({
      sessionId: 'cs_setup_123',
      userId: harness.userId,
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_123',
      plan: 'monthly',
      amountCents: 2900,
      currency: 'usd',
      frequency: 'month',
      trialEndsAt,
      disclosureSnapshot: 'Renews monthly at $29 until canceled.',
      disclosureVersion: '2026-08-05',
      termsVersion: '2026-08-05',
      termsHash: 'terms-hash',
      cancellationMethod:
        'Cancel on the Billing page in the app or email support@addictionboards.com.',
    });

    await processStripeWebhook(harness.deps, {
      rawBody: 'raw',
      signature: 'sig',
    });

    expect(harness.renewalConsents.snapshot()).toEqual([
      expect.objectContaining({ setupSessionId: 'cs_setup_123' }),
    ]);
    expect(harness.renewalDeliveries.records).toEqual([
      expect.objectContaining({
        noticeKind: 'acknowledgment',
        status: 'queued',
      }),
    ]);
  });
});
