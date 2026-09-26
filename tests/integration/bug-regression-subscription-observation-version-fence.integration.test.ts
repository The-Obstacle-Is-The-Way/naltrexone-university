import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { processStripeWebhook } from '@/src/adapters/controllers/stripe-webhook-controller';
import { createStripeWebhookRenewalAcknowledgmentTestDeps } from '@/src/adapters/controllers/test-helpers/stripe-webhook-renewal-acknowledgment';
import { FakeStripeCheckoutClient } from '@/src/adapters/gateways/stripe/test-helpers/fake-stripe-checkout-client';
import { reconcileStripeSubscriptions } from '@/src/adapters/jobs/reconcile-stripe-subscriptions';
import { DrizzleRenewalConsentRecordRepository } from '@/src/adapters/repositories/drizzle-renewal-consent-record-repository';
import { DrizzleStripeCustomerRepository } from '@/src/adapters/repositories/drizzle-stripe-customer-repository';
import { DrizzleStripeEventRepository } from '@/src/adapters/repositories/drizzle-stripe-event-repository';
import { DrizzleSubscriptionRepository } from '@/src/adapters/repositories/drizzle-subscription-repository';
import { DrizzleTrialPaymentMethodSetupOperationRepository } from '@/src/adapters/repositories/drizzle-trial-payment-method-setup-operation-repository';
import type { WebhookEventResult } from '@/src/application/ports/gateways';
import {
  FakeLogger,
  FakePaymentGateway,
} from '@/src/application/test-helpers/fakes';
import { runSubscriptionObservationVersionContract } from '@/tests/shared/subscription-observation-version-contract';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createUser,
} from './helpers';

const { db, sql } = createIntegrationDb();
const writerA = createIntegrationDb();
const writerB = createIntegrationDb();
const cleanup = createCleanupState();
const priceIds = {
  monthly: 'price_test_monthly',
  annual: 'price_test_annual',
} as const;

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await Promise.all([
    closeConnection(sql),
    closeConnection(writerA.sql),
    closeConnection(writerB.sql),
  ]);
});

runSubscriptionObservationVersionContract(
  'DrizzleSubscriptionRepository',
  async () => {
    const user = await createUser(db, cleanup);

    return {
      repository: new DrizzleSubscriptionRepository(db, priceIds),
      userId: user.id,
      externalSubscriptionId: (label: string) =>
        `sub_${label}_${randomUUID().replaceAll('-', '')}`,
    };
  },
);

function stripeSubscription(input: {
  userId: string;
  externalCustomerId: string;
  externalSubscriptionId: string;
  status: 'active' | 'canceled';
  currentPeriodEnd: number;
}) {
  return {
    id: input.externalSubscriptionId,
    customer: input.externalCustomerId,
    status: input.status,
    cancel_at_period_end: false,
    metadata: { user_id: input.userId },
    items: {
      data: [
        {
          current_period_end: input.currentPeriodEnd,
          price: { id: priceIds.monthly },
        },
      ],
    },
  };
}

class ControlledWebhookGateway extends FakePaymentGateway {
  private callCount = 0;

  constructor(
    private readonly handler: (
      call: number,
    ) => Promise<WebhookEventResult> | WebhookEventResult,
  ) {
    super({
      externalCustomerId: 'cus_unused',
      checkoutUrl: 'https://stripe.test/checkout',
      portalUrl: 'https://stripe.test/portal',
      webhookResult: { eventId: 'evt_unused', type: 'unused' },
    });
  }

  override async processWebhookEvent(
    rawBody: string,
    signature: string,
  ): Promise<WebhookEventResult> {
    this.webhookInputs.push({ rawBody, signature });
    this.callCount += 1;
    return this.handler(this.callCount);
  }
}

function normalizedWebhookResult(input: {
  eventId: string;
  userId: string;
  externalCustomerId: string;
  externalSubscriptionId: string;
  status: 'active' | 'canceled';
  currentPeriodEnd: Date;
}): WebhookEventResult {
  return {
    eventId: input.eventId,
    type: 'customer.subscription.updated',
    subscriptionUpdate: {
      userId: input.userId,
      externalCustomerId: input.externalCustomerId,
      externalSubscriptionId: input.externalSubscriptionId,
      plan: 'monthly',
      status: input.status,
      currentPeriodEnd: input.currentPeriodEnd,
      cancelAtPeriodEnd: false,
    },
  };
}

async function runWebhook(input: {
  gateway: FakePaymentGateway;
  writer: typeof writerA.db;
  eventId: string;
}): Promise<void> {
  cleanup.stripeEventIds.push(input.eventId);
  const subscriptionVersions = new DrizzleSubscriptionRepository(
    input.writer,
    priceIds,
  );
  const acknowledgment = createStripeWebhookRenewalAcknowledgmentTestDeps();

  await processStripeWebhook(
    {
      paymentGateway: input.gateway,
      subscriptionVersions,
      logger: new FakeLogger(),
      now: () => new Date('2026-07-11T00:00:00.000Z'),
      ...acknowledgment.webhook,
      transaction: (fn) =>
        input.writer.transaction((tx) =>
          fn({
            stripeEvents: new DrizzleStripeEventRepository(tx),
            subscriptions: new DrizzleSubscriptionRepository(tx, priceIds),
            stripeCustomers: new DrizzleStripeCustomerRepository(tx),
            trialPaymentMethodSetupOperations:
              new DrizzleTrialPaymentMethodSetupOperationRepository(tx),
            renewalConsentRecords: new DrizzleRenewalConsentRecordRepository(
              tx,
            ),
            ...acknowledgment.transaction,
          }),
        ),
    },
    { rawBody: input.eventId, signature: 'sig_test' },
  );
}

describe('BUG-287 real PostgreSQL interleavings', () => {
  it('rejects a stale reconcile Phase-4 write and re-retrieves to convergence', async () => {
    const user = await createUser(db, cleanup);
    const externalCustomerId = `cus_${randomUUID().replaceAll('-', '')}`;
    const externalSubscriptionId = `sub_${randomUUID().replaceAll('-', '')}`;
    const eventId = `evt_${randomUUID().replaceAll('-', '')}`;
    const repository = new DrizzleSubscriptionRepository(db, priceIds);
    await repository.upsert({
      userId: user.id,
      externalSubscriptionId,
      plan: 'monthly',
      status: 'active',
      currentPeriodEnd: new Date('2030-01-01T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
      expectedVersion: null,
    });

    const phaseOneVersion = await repository.findObservationVersionByUserId(
      user.id,
    );
    if (phaseOneVersion === null) throw new Error('Missing seeded version');

    const reconcileWindowOpen = createDeferred<void>();
    const releaseReconcile = createDeferred<void>();
    const staleSubscription = stripeSubscription({
      userId: user.id,
      externalCustomerId,
      externalSubscriptionId,
      status: 'active',
      currentPeriodEnd: 1_893_456_000,
    });
    const freshSubscription = stripeSubscription({
      userId: user.id,
      externalCustomerId,
      externalSubscriptionId,
      status: 'canceled',
      currentPeriodEnd: 1_767_139_200,
    });
    // Stripe still reports the active Subscription until the webhook lands.
    // The first listing holds reconciliation inside its read window.
    const stripe = new FakeStripeCheckoutClient();
    stripe.seedSubscription(staleSubscription);
    stripe.setSubscriptionListHook(async () => {
      if (stripe.subscriptions.listCalls.length > 1) return;
      reconcileWindowOpen.resolve();
      await releaseReconcile.promise;
    });

    const reconcilePromise = reconcileStripeSubscriptions(
      { limit: 1, offset: 0, dryRun: true, concurrency: 1 },
      {
        stripe,
        priceIds,
        logger: new FakeLogger(),
        now: () => new Date('2026-07-11T00:00:00.000Z'),
        listLocalSubscriptions: async () => [
          {
            userId: user.id,
            stripeSubscriptionId: externalSubscriptionId,
            version: phaseOneVersion,
          },
        ],
        transaction: (fn) =>
          writerA.db.transaction((tx) =>
            fn({
              subscriptions: new DrizzleSubscriptionRepository(tx, priceIds),
              stripeCustomers: new DrizzleStripeCustomerRepository(tx),
              renewalConsentRecords: new DrizzleRenewalConsentRecordRepository(
                tx,
              ),
            }),
          ),
      },
    );

    await reconcileWindowOpen.promise;
    try {
      const webhookGateway = new ControlledWebhookGateway(() =>
        normalizedWebhookResult({
          eventId,
          userId: user.id,
          externalCustomerId,
          externalSubscriptionId,
          status: 'canceled',
          currentPeriodEnd: new Date('2025-12-31T00:00:00.000Z'),
        }),
      );
      await runWebhook({
        gateway: webhookGateway,
        writer: writerB.db,
        eventId,
      });
      // The webhook announced Stripe's cancellation; Stripe now reports it.
      stripe.markSubscriptionCanceled(externalSubscriptionId);
      stripe.setSubscriptionRetrieveOverride(() => freshSubscription);
    } finally {
      releaseReconcile.resolve();
    }

    await expect(reconcilePromise).resolves.toMatchObject({
      updated: 1,
      failed: 0,
    });
    await expect(repository.findByUserId(user.id)).resolves.toMatchObject({
      status: 'canceled',
      currentPeriodEnd: new Date('2025-12-31T00:00:00.000Z'),
    });
    await expect(
      repository.findObservationVersionByUserId(user.id),
    ).resolves.toBe(3);
    expect(stripe.subscriptions.retrieveCalls).toHaveLength(2);
    expect(stripe.subscriptions.listCalls).toHaveLength(2);
  });

  it('rejects the reverse-commit webhook observation and retries with current state', async () => {
    const user = await createUser(db, cleanup);
    const externalCustomerId = `cus_${randomUUID().replaceAll('-', '')}`;
    const externalSubscriptionId = `sub_${randomUUID().replaceAll('-', '')}`;
    const eventAId = `evt_${randomUUID().replaceAll('-', '')}`;
    const eventBId = `evt_${randomUUID().replaceAll('-', '')}`;
    const repository = new DrizzleSubscriptionRepository(db, priceIds);
    await repository.upsert({
      userId: user.id,
      externalSubscriptionId,
      plan: 'monthly',
      status: 'active',
      currentPeriodEnd: new Date('2030-01-01T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
      expectedVersion: null,
    });

    const writerARetrieved = createDeferred<void>();
    const releaseWriterA = createDeferred<void>();
    const staleResult = normalizedWebhookResult({
      eventId: eventAId,
      userId: user.id,
      externalCustomerId,
      externalSubscriptionId,
      status: 'active',
      currentPeriodEnd: new Date('2030-01-01T00:00:00.000Z'),
    });
    const freshAResult = normalizedWebhookResult({
      eventId: eventAId,
      userId: user.id,
      externalCustomerId,
      externalSubscriptionId,
      status: 'canceled',
      currentPeriodEnd: new Date('2025-12-31T00:00:00.000Z'),
    });
    const freshBResult = normalizedWebhookResult({
      eventId: eventBId,
      userId: user.id,
      externalCustomerId,
      externalSubscriptionId,
      status: 'canceled',
      currentPeriodEnd: new Date('2025-12-31T00:00:00.000Z'),
    });
    const gatewayA = new ControlledWebhookGateway(async (call) => {
      if (call === 1) return staleResult;
      if (call === 2) {
        writerARetrieved.resolve();
        await releaseWriterA.promise;
        return staleResult;
      }
      return freshAResult;
    });
    const gatewayB = new ControlledWebhookGateway(() => freshBResult);

    const writerAPromise = runWebhook({
      gateway: gatewayA,
      writer: writerA.db,
      eventId: eventAId,
    });
    await writerARetrieved.promise;
    try {
      await runWebhook({
        gateway: gatewayB,
        writer: writerB.db,
        eventId: eventBId,
      });
    } finally {
      releaseWriterA.resolve();
    }
    await writerAPromise;

    await expect(repository.findByUserId(user.id)).resolves.toMatchObject({
      status: 'canceled',
      currentPeriodEnd: new Date('2025-12-31T00:00:00.000Z'),
    });
    await expect(
      repository.findObservationVersionByUserId(user.id),
    ).resolves.toBe(3);
    expect(gatewayA.webhookInputs).toHaveLength(3);
    expect(gatewayB.webhookInputs).toHaveLength(2);
    await expect(
      new DrizzleStripeEventRepository(db).lock(eventAId),
    ).resolves.toMatchObject({ processedAt: expect.any(Date), error: null });
    await expect(
      new DrizzleStripeEventRepository(db).lock(eventBId),
    ).resolves.toMatchObject({ processedAt: expect.any(Date), error: null });
  });
});
