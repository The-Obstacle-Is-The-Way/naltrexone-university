import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { processStripeWebhook } from '@/src/adapters/controllers/stripe-webhook-controller';
import { createStripeWebhookRenewalAcknowledgmentTestDeps } from '@/src/adapters/controllers/test-helpers/stripe-webhook-renewal-acknowledgment';
import { DrizzleRenewalConsentRecordRepository } from '@/src/adapters/repositories/drizzle-renewal-consent-record-repository';
import { DrizzleStripeCustomerRepository } from '@/src/adapters/repositories/drizzle-stripe-customer-repository';
import { DrizzleStripeEventRepository } from '@/src/adapters/repositories/drizzle-stripe-event-repository';
import { DrizzleSubscriptionRepository } from '@/src/adapters/repositories/drizzle-subscription-repository';
import { DrizzleTrialPaymentMethodSetupOperationRepository } from '@/src/adapters/repositories/drizzle-trial-payment-method-setup-operation-repository';
import {
  FakeLogger,
  FakePaymentGateway,
} from '@/src/application/test-helpers/fakes';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import {
  configureFastDeadlockWriter,
  createLockOrderHarness,
  type DeletionRaceFixture,
  getBackendPid,
  priceIds,
} from './stripe-subscription-writer-lock-order-test-helpers';

// Webhook writers racing the Clerk deletion writer. The races against the
// reconciliation job are in stripe-subscription-writer-lock-order-reconcile.
const harness = createLockOrderHarness();

async function runFirstInsertWebhookWriter(
  input: DeletionRaceFixture & {
    eventId: string;
    backendPid: (pid: number) => void;
  },
): Promise<void> {
  harness.cleanup.stripeEventIds.push(input.eventId);
  const paymentGateway = new FakePaymentGateway({
    externalCustomerId: input.externalCustomerId,
    checkoutUrl: 'https://stripe.test/checkout',
    portalUrl: 'https://stripe.test/portal',
    webhookResult: {
      eventId: input.eventId,
      type: 'customer.subscription.updated',
      subscriptionUpdate: {
        userId: input.userId,
        externalCustomerId: input.externalCustomerId,
        externalSubscriptionId: input.externalSubscriptionId,
        plan: 'monthly',
        status: 'active',
        currentPeriodEnd: new Date('2030-01-01T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
      },
    },
  });
  const acknowledgment = createStripeWebhookRenewalAcknowledgmentTestDeps();

  // Production repositories, no pause points: the first-insert path must
  // block at the deletion writer's advisory, not inside its own INSERT's
  // FK share-lock on the users row.
  await processStripeWebhook(
    {
      paymentGateway,
      subscriptionVersions: new DrizzleSubscriptionRepository(
        harness.subscriptionWriter.db,
        priceIds,
      ),
      logger: new FakeLogger(),
      now: () => new Date(),
      ...acknowledgment.webhook,
      transaction: async (fn) =>
        harness.subscriptionWriter.db.transaction(async (tx) => {
          await configureFastDeadlockWriter(tx);
          input.backendPid(await getBackendPid(tx));
          return fn({
            stripeEvents: new DrizzleStripeEventRepository(tx),
            subscriptions: new DrizzleSubscriptionRepository(tx, priceIds),
            stripeCustomers: new DrizzleStripeCustomerRepository(tx),
            trialPaymentMethodSetupOperations:
              new DrizzleTrialPaymentMethodSetupOperationRepository(tx),
            renewalConsentRecords: new DrizzleRenewalConsentRecordRepository(
              tx,
            ),
            ...acknowledgment.transaction,
          });
        }),
    },
    { rawBody: 'raw', signature: 'sig_lock_order_first_insert' },
  );
}

describe('Stripe subscription writer lock order', () => {
  it('serializes the deletion writer and webhook writer without a 40P01 deadlock', async () => {
    const { counterparty, deletion } = await harness.raceDeletionWriter({
      customerMapping: 'seeded',
      startCounterparty: (fixture, lockHeld, release) =>
        harness.runWebhookWriter({
          ...fixture,
          eventId: `evt_${randomUUID().replaceAll('-', '')}`,
          lockHeld,
          release,
          deletionCounterparty: true,
        }),
    });

    // A 40P01 deadlock would reject one of the writers.
    expect(counterparty).toMatchObject({ status: 'fulfilled' });
    expect(deletion).toMatchObject({ status: 'fulfilled' });
  });

  it('serializes the deletion writer and a webhook writer that inserts the customer mapping without a 40P01 deadlock', async () => {
    const { counterparty, deletion } = await harness.raceDeletionWriter({
      customerMapping: 'absent',
      startCounterparty: (fixture, lockHeld, release) =>
        harness.runWebhookWriter({
          ...fixture,
          eventId: `evt_${randomUUID().replaceAll('-', '')}`,
          lockHeld,
          release,
          deletionCounterparty: true,
        }),
    });

    // Only the canonical order (advisory before the users row) lets the
    // counterparty's INSERT take its users-row share lock and commit.
    expect(counterparty).toMatchObject({ status: 'fulfilled' });
    expect(deletion).toMatchObject({ status: 'fulfilled' });
  });

  it('serializes the deletion writer and a first-insert webhook writer at the advisory lock', async () => {
    // Seed ONLY the customer mapping: with no stripe_subscriptions row the
    // counterparty's production upsert takes the INSERT path, whose FK check
    // share-locks the users row the deletion writer holds FOR UPDATE.
    const fixture = await harness.seedDeletionFixture();
    await harness.seedCustomerMapping(fixture);

    const deletionCustomerRead = createDeferred<void>();
    const releaseDeletion = createDeferred<void>();
    const deletionPid = createDeferred<number>();
    const deletionPromise = harness.runDeletionWriter({
      clerkUserId: fixture.clerkUserId,
      eventId: fixture.clerkEventId,
      backendPid: (pid) => deletionPid.resolve(pid),
      customerRead: () => deletionCustomerRead.resolve(),
      release: releaseDeletion.promise,
    });
    await deletionCustomerRead.promise;

    const counterpartyPid = createDeferred<number>();
    const stripeEventId = `evt_${randomUUID().replaceAll('-', '')}`;
    const counterpartyPromise = runFirstInsertWebhookWriter({
      userId: fixture.userId,
      externalCustomerId: fixture.externalCustomerId,
      externalSubscriptionId: fixture.externalSubscriptionId,
      eventId: stripeEventId,
      backendPid: (pid) => counterpartyPid.resolve(pid),
    });

    // The conforming counterparty must queue at the advisory lock, never at
    // the users-row share lock inside its INSERT (the pre-fix AB-BA edge).
    try {
      await harness.expectWaitingOnAdvisory(await counterpartyPid.promise);
    } finally {
      releaseDeletion.resolve();
    }

    const [deletionResult, counterpartyResult] = await Promise.allSettled([
      deletionPromise,
      counterpartyPromise,
    ]);

    expect(deletionResult.status).toBe('fulfilled');
    // The counterparty loses to the committed deletion at the missing-user
    // FK without a 40P01 deadlock. BUG-296 classifies that exact FK and
    // acknowledges the terminal webhook instead of surfacing a 500.
    expect(counterpartyResult.status).toBe('fulfilled');
    await expect(
      harness.control.db.query.users.findFirst({
        where: eq(schema.users.id, fixture.userId),
      }),
    ).resolves.toBeUndefined();
    await expect(
      harness.control.db.query.stripeSubscriptions.findFirst({
        where: eq(schema.stripeSubscriptions.userId, fixture.userId),
      }),
    ).resolves.toBeUndefined();
    await expect(
      harness.control.db.query.stripeEvents.findFirst({
        where: eq(schema.stripeEvents.id, stripeEventId),
      }),
    ).resolves.toMatchObject({
      processedAt: expect.any(Date),
      error: null,
    });
  });
});
