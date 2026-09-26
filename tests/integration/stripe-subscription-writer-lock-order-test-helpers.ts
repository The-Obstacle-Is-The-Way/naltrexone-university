// Harness shared by the Stripe subscription writer lock-order suites. Each
// suite gets its own connections; the writers here are the ones both use.
import { randomUUID } from 'node:crypto';
import { sql as drizzleSql, eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, expect, vi } from 'vitest';
import * as schema from '@/db/schema';
import { processClerkWebhook } from '@/src/adapters/controllers/clerk-webhook-controller';
import { processStripeWebhook } from '@/src/adapters/controllers/stripe-webhook-controller';
import { createStripeWebhookRenewalAcknowledgmentTestDeps } from '@/src/adapters/controllers/test-helpers/stripe-webhook-renewal-acknowledgment';
import { DrizzleClerkEventRepository } from '@/src/adapters/repositories/drizzle-clerk-event-repository';
import { DrizzleDeletedClerkUserRepository } from '@/src/adapters/repositories/drizzle-deleted-clerk-user-repository';
import { DrizzlePendingStripeCustomerCleanupRepository } from '@/src/adapters/repositories/drizzle-pending-stripe-customer-cleanup-repository';
import { DrizzleRenewalConsentRecordRepository } from '@/src/adapters/repositories/drizzle-renewal-consent-record-repository';
import { DrizzleStripeCustomerRepository } from '@/src/adapters/repositories/drizzle-stripe-customer-repository';
import { DrizzleStripeEventRepository } from '@/src/adapters/repositories/drizzle-stripe-event-repository';
import { DrizzleSubscriptionRepository } from '@/src/adapters/repositories/drizzle-subscription-repository';
import { DrizzleTrialPaymentMethodSetupOperationRepository } from '@/src/adapters/repositories/drizzle-trial-payment-method-setup-operation-repository';
import { DrizzleUserRepository } from '@/src/adapters/repositories/drizzle-user-repository';
import { acquireSubscriptionWriteLock } from '@/src/adapters/repositories/subscription-write-lock';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';
import {
  FakeLogger,
  FakePaymentGateway,
} from '@/src/application/test-helpers/fakes';
import { createTestWebhookSubscriptionUpdate } from '@/src/application/test-helpers/webhook-event-results';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createUser,
} from './helpers';

export const priceIds = {
  monthly: 'price_test_monthly',
  annual: 'price_test_annual',
} as const;

export class PausingSubscriptionRepository extends DrizzleSubscriptionRepository {
  constructor(
    db: DrizzleDb,
    private readonly lockHeld: () => void,
    private readonly release: Promise<void>,
  ) {
    super(db, priceIds);
  }

  override async upsert(
    input: Parameters<DrizzleSubscriptionRepository['upsert']>[0],
  ) {
    const result = await super.upsert(input);
    this.lockHeld();
    await this.release;
    return result;
  }
}

// Hold the exact production advisory + subscription-row locks at the boundary
// immediately before each coordinator writes stripe_customers.
export class PausingDeletionCounterpartySubscriptionRepository extends DrizzleSubscriptionRepository {
  constructor(
    private readonly tx: DrizzleDb,
    private readonly lockHeld: () => void,
    private readonly release: Promise<void>,
  ) {
    super(tx, priceIds);
  }

  override async upsert(
    input: Parameters<DrizzleSubscriptionRepository['upsert']>[0],
  ) {
    await acquireSubscriptionWriteLock(this.tx, input.userId);
    const lockedRows = await this.tx
      .select()
      .from(schema.stripeSubscriptions)
      .where(eq(schema.stripeSubscriptions.userId, input.userId))
      .for('update');
    expect(
      lockedRows,
      'Deletion lock-order fixture is missing a subscription',
    ).toHaveLength(1);

    this.lockHeld();
    await this.release;
    return { persisted: true } as const;
  }
}

export class RawDeletionCounterpartyStripeCustomerRepository extends DrizzleStripeCustomerRepository {
  constructor(private readonly tx: DrizzleDb) {
    super(tx);
  }

  override async insert(
    userId: string,
    stripeCustomerId: string,
  ): Promise<void> {
    // Mirror the production authoritative upsert without translating the raw
    // Postgres code so the red baseline can prove 40P01 directly.
    await this.tx
      .insert(schema.stripeCustomers)
      .values({ userId, stripeCustomerId })
      .onConflictDoUpdate({
        target: schema.stripeCustomers.userId,
        set: { stripeCustomerId },
      });
  }
}

class PausingDeletionStripeCustomerRepository extends DrizzleStripeCustomerRepository {
  constructor(
    db: DrizzleDb,
    private readonly customerRead: () => void,
    private readonly release: Promise<void>,
  ) {
    super(db);
  }

  override async findByUserId(userId: string) {
    const customer = await super.findByUserId(userId);
    this.customerRead();
    await this.release;
    return customer;
  }
}

class RawDeletionUserRepository extends DrizzleUserRepository {
  constructor(private readonly tx: DrizzleDb) {
    super(tx);
  }

  override async deleteByClerkId(clerkId: string): Promise<boolean> {
    // Mirror the production delete without translating the raw Postgres code
    // so either deadlock victim remains observable to the test.
    const [deleted] = await this.tx
      .delete(schema.users)
      .where(eq(schema.users.clerkUserId, clerkId))
      .returning({ id: schema.users.id });
    return !!deleted;
  }
}

export async function configureSubscriptionWriter(
  tx: DrizzleDb,
): Promise<void> {
  await tx.execute(drizzleSql`set local deadlock_timeout = '5s'`);
  await tx.execute(drizzleSql`set local lock_timeout = '4s'`);
  await tx.execute(drizzleSql`set local statement_timeout = '6s'`);
}

export async function configureFastDeadlockWriter(
  tx: DrizzleDb,
): Promise<void> {
  await tx.execute(drizzleSql`set local deadlock_timeout = '50ms'`);
  await tx.execute(drizzleSql`set local lock_timeout = '4s'`);
  await tx.execute(drizzleSql`set local statement_timeout = '6s'`);
}

export async function getBackendPid(tx: DrizzleDb): Promise<number> {
  const rows = await tx.execute<{ pid: number }>(
    drizzleSql`select pg_backend_pid()::int as pid`,
  );
  const [pid] = rows.map((row) => row.pid);
  expect(pid, 'Failed to read PostgreSQL backend pid').toBeTypeOf('number');
  return Number(pid);
}

export type DeletionRaceFixture = {
  userId: string;
  externalCustomerId: string;
  externalSubscriptionId: string;
};

export function createLockOrderHarness() {
  const control = createIntegrationDb();
  const subscriptionWriter = createIntegrationDb();
  const reconciliationWriter = createIntegrationDb();
  const deletionWriter = createIntegrationDb();
  const cleanup = createCleanupState();
  const clerkEventIds: string[] = [];
  const deletedClerkUserIds: string[] = [];

  afterEach(async () => {
    await control.db
      .delete(schema.clerkEvents)
      .where(inArray(schema.clerkEvents.id, clerkEventIds.splice(0)));
    await control.db
      .delete(schema.deletedClerkUsers)
      .where(
        inArray(
          schema.deletedClerkUsers.clerkUserId,
          deletedClerkUserIds.splice(0),
        ),
      );
    await cleanupAfterEach(control.db, cleanup);
  });

  afterAll(async () => {
    await Promise.all([
      closeConnection(control.sql),
      closeConnection(subscriptionWriter.sql),
      closeConnection(reconciliationWriter.sql),
      closeConnection(deletionWriter.sql),
    ]);
  });

  // One row whatever the backend is doing, so callers poll a stable shape.
  async function readWaitState(pid: number): Promise<string[]> {
    const rows = await control.db.execute<{ waitState: string }>(drizzleSql`
      select case
        when exists (
          select 1
          from pg_locks
          where pid = ${pid}
            and locktype = 'advisory'
            and not granted
        ) then 'advisory'
        when (
          select wait_event_type from pg_stat_activity where pid = ${pid}
        ) = 'Lock' then 'row-lock'
        else 'running'
      end as "waitState"
    `);
    return rows.map((row) => row.waitState);
  }

  // A writer that takes a row lock before the advisory waits in 'row-lock'
  // instead. The poll gives up before the writers' 4 s lock_timeout, so its
  // failure message still shows that state.
  async function expectWaitingOnAdvisory(pid: number): Promise<void> {
    await expect
      .poll(() => readWaitState(pid), { timeout: 3_000, interval: 10 })
      .toEqual(['advisory']);
  }

  // Seeds a user, and registers it and its deletion event for cleanup.
  async function seedDeletionFixture() {
    const user = await createUser(control.db, cleanup);
    const storedUsers = await control.db
      .select({ clerkUserId: schema.users.clerkUserId })
      .from(schema.users)
      .where(eq(schema.users.id, user.id));
    const [clerkUserId] = storedUsers.map((row) => row.clerkUserId);
    expect(clerkUserId, 'Failed to reload integration user').toBeTypeOf(
      'string',
    );
    const clerkEventId = `evt_${randomUUID().replaceAll('-', '')}`;
    clerkEventIds.push(clerkEventId);
    deletedClerkUserIds.push(String(clerkUserId));
    const fixture: DeletionRaceFixture = {
      userId: user.id,
      externalCustomerId: `cus_${randomUUID().replaceAll('-', '')}`,
      externalSubscriptionId: `sub_${randomUUID().replaceAll('-', '')}`,
    };
    return { ...fixture, clerkUserId: String(clerkUserId), clerkEventId };
  }

  async function seedCustomerMapping(fixture: DeletionRaceFixture) {
    await new DrizzleStripeCustomerRepository(control.db).insert(
      fixture.userId,
      fixture.externalCustomerId,
    );
  }

  async function runWebhookWriter(
    input: DeletionRaceFixture & {
      eventId: string;
      lockHeld: () => void;
      release: Promise<void>;
      deletionCounterparty?: boolean;
    },
  ): Promise<void> {
    cleanup.stripeEventIds.push(input.eventId);
    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: input.externalCustomerId,
      checkoutUrl: 'https://stripe.test/checkout',
      portalUrl: 'https://stripe.test/portal',
      webhookResult: {
        eventId: input.eventId,
        type: 'customer.subscription.updated',
        subscriptionUpdate: createTestWebhookSubscriptionUpdate({
          userId: input.userId,
          externalCustomerId: input.externalCustomerId,
          externalSubscriptionId: input.externalSubscriptionId,
          currentPeriodEnd: new Date('2030-01-01T00:00:00.000Z'),
        }),
      },
    });
    const acknowledgment = createStripeWebhookRenewalAcknowledgmentTestDeps();

    await processStripeWebhook(
      {
        paymentGateway,
        subscriptionVersions: new DrizzleSubscriptionRepository(
          subscriptionWriter.db,
          priceIds,
        ),
        logger: new FakeLogger(),
        now: () => new Date(),
        ...acknowledgment.webhook,
        transaction: async (fn) =>
          subscriptionWriter.db.transaction(async (tx) => {
            await configureSubscriptionWriter(tx);
            return fn({
              stripeEvents: new DrizzleStripeEventRepository(tx),
              subscriptions: input.deletionCounterparty
                ? new PausingDeletionCounterpartySubscriptionRepository(
                    tx,
                    input.lockHeld,
                    input.release,
                  )
                : new PausingSubscriptionRepository(
                    tx,
                    input.lockHeld,
                    input.release,
                  ),
              stripeCustomers: input.deletionCounterparty
                ? new RawDeletionCounterpartyStripeCustomerRepository(tx)
                : new DrizzleStripeCustomerRepository(tx),
              trialPaymentMethodSetupOperations:
                new DrizzleTrialPaymentMethodSetupOperationRepository(tx),
              renewalConsentRecords: new DrizzleRenewalConsentRecordRepository(
                tx,
              ),
              ...acknowledgment.transaction,
            });
          }),
      },
      { rawBody: 'raw', signature: 'sig_lock_order' },
    );
  }

  async function runDeletionWriter(input: {
    clerkUserId: string;
    eventId: string;
    backendPid: (pid: number) => void;
    customerRead: () => void;
    release: Promise<void>;
  }): Promise<void> {
    // user.deleted never looks the Clerk user up.
    const getClerkUserById = vi.fn();
    await processClerkWebhook(
      {
        transaction: async (fn) =>
          deletionWriter.db.transaction(async (tx) => {
            await configureFastDeadlockWriter(tx);
            input.backendPid(await getBackendPid(tx));
            return fn({
              clerkEvents: new DrizzleClerkEventRepository(tx),
              deletedClerkUsers: new DrizzleDeletedClerkUserRepository(tx),
              pendingStripeCustomerCleanups:
                new DrizzlePendingStripeCustomerCleanupRepository(tx),
              userRepository: new RawDeletionUserRepository(tx),
              stripeCustomerRepository:
                new PausingDeletionStripeCustomerRepository(
                  tx,
                  input.customerRead,
                  input.release,
                ),
            });
          }),
        deleteStripeCustomer: async () => undefined,
        getClerkUserById,
        logger: new FakeLogger(),
      },
      {
        eventId: input.eventId,
        type: 'user.deleted',
        data: { id: input.clerkUserId },
      },
    );
    expect(getClerkUserById).not.toHaveBeenCalled();
  }

  // A counterparty writer takes the advisory and the subscription-row lock
  // and pauses; the deletion writer, which takes the advisory before any
  // users-row lock, must then queue at the advisory. Returns both outcomes
  // once the counterparty is released. With the customer mapping 'absent',
  // the released counterparty inserts it, and that INSERT's foreign-key check
  // share-locks the users row: a deletion writer holding that row while it
  // waits for the advisory would deadlock.
  async function raceDeletionWriter(input: {
    customerMapping: 'seeded' | 'absent';
    startCounterparty: (
      fixture: DeletionRaceFixture,
      lockHeld: () => void,
      release: Promise<void>,
    ) => Promise<unknown>;
  }) {
    const fixture = await seedDeletionFixture();
    if (input.customerMapping === 'seeded') await seedCustomerMapping(fixture);
    await new DrizzleSubscriptionRepository(control.db, priceIds).upsert({
      userId: fixture.userId,
      externalSubscriptionId: fixture.externalSubscriptionId,
      plan: 'monthly',
      status: 'active',
      expectedVersion: null,
      currentPeriodEnd: new Date('2029-01-01T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
    });

    const counterpartyLockHeld = createDeferred<void>();
    const releaseCounterparty = createDeferred<void>();
    const counterpartyPromise = input.startCounterparty(
      fixture,
      () => counterpartyLockHeld.resolve(),
      releaseCounterparty.promise,
    );
    await counterpartyLockHeld.promise;

    // The customer-read pause is pre-released because it happens under the
    // advisory lock.
    const releaseDeletion = createDeferred<void>();
    releaseDeletion.resolve();
    const deletionPid = createDeferred<number>();
    const deletionPromise = runDeletionWriter({
      clerkUserId: fixture.clerkUserId,
      eventId: fixture.clerkEventId,
      backendPid: (pid) => deletionPid.resolve(pid),
      customerRead: () => undefined,
      release: releaseDeletion.promise,
    });

    try {
      await expectWaitingOnAdvisory(await deletionPid.promise);
    } finally {
      releaseCounterparty.resolve();
    }

    const [counterparty, deletion] = await Promise.allSettled([
      counterpartyPromise,
      deletionPromise,
    ]);
    return { counterparty, deletion };
  }

  return {
    control,
    subscriptionWriter,
    reconciliationWriter,
    cleanup,
    expectWaitingOnAdvisory,
    seedDeletionFixture,
    seedCustomerMapping,
    runWebhookWriter,
    runDeletionWriter,
    raceDeletionWriter,
  };
}
