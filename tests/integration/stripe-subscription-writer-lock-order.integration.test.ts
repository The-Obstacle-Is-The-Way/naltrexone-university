// biome-ignore lint/style/noExcessiveLinesPerFile: Keep subscription writer lock-order concurrency scenarios together — split tracked by DEBT-469.
import { randomUUID } from 'node:crypto';
import { sql as drizzleSql, eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  type CheckoutSuccessDeps,
  syncCheckoutSuccess,
} from '@/app/(marketing)/checkout/success/checkout-success-sync';
import * as schema from '@/db/schema';
import { processClerkWebhook } from '@/src/adapters/controllers/clerk-webhook-controller';
import { processStripeWebhook } from '@/src/adapters/controllers/stripe-webhook-controller';
import { createStripeWebhookRenewalAcknowledgmentTestDeps } from '@/src/adapters/controllers/test-helpers/stripe-webhook-renewal-acknowledgment';
import { reconcileStripeSubscriptions } from '@/src/adapters/jobs/reconcile-stripe-subscriptions';
import type { ReconcileStripeSubscriptionsDeps } from '@/src/adapters/jobs/reconcile-stripe-subscriptions-types';
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
  FakeAuthGateway,
  FakeLogger,
  FakePaymentGateway,
} from '@/src/application/test-helpers/fakes';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createUser,
} from './helpers';

const control = createIntegrationDb();
const subscriptionWriter = createIntegrationDb();
const reconciliationWriter = createIntegrationDb();
const deletionWriter = createIntegrationDb();
const cleanup = createCleanupState();
const clerkEventIds: string[] = [];
const deletedClerkUserIds: string[] = [];

const priceIds = {
  monthly: 'price_test_monthly',
  annual: 'price_test_annual',
} as const;

class PausingSubscriptionRepository extends DrizzleSubscriptionRepository {
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
class PausingDeletionCounterpartySubscriptionRepository extends DrizzleSubscriptionRepository {
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
    const [existing] = await this.tx
      .select()
      .from(schema.stripeSubscriptions)
      .where(eq(schema.stripeSubscriptions.userId, input.userId))
      .for('update');
    if (!existing) {
      throw new Error('Deletion lock-order fixture is missing a subscription');
    }

    this.lockHeld();
    await this.release;
    return { persisted: true } as const;
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

class RawDeletionCounterpartyStripeCustomerRepository extends DrizzleStripeCustomerRepository {
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

class ObservedStripeCustomerRepository extends DrizzleStripeCustomerRepository {
  constructor(
    db: DrizzleDb,
    private readonly lockHeld: () => void,
  ) {
    super(db);
  }

  override async insert(
    ...args: Parameters<DrizzleStripeCustomerRepository['insert']>
  ): Promise<void> {
    await super.insert(...args);
    this.lockHeld();
  }
}

async function configureSubscriptionWriter(tx: DrizzleDb): Promise<void> {
  await tx.execute(drizzleSql`set local deadlock_timeout = '5s'`);
  await tx.execute(drizzleSql`set local lock_timeout = '4s'`);
  await tx.execute(drizzleSql`set local statement_timeout = '6s'`);
}

async function configureFastDeadlockWriter(tx: DrizzleDb): Promise<void> {
  await tx.execute(drizzleSql`set local deadlock_timeout = '50ms'`);
  await tx.execute(drizzleSql`set local lock_timeout = '4s'`);
  await tx.execute(drizzleSql`set local statement_timeout = '6s'`);
}

async function getBackendPid(tx: DrizzleDb): Promise<number> {
  const rows = await tx.execute<{ pid: number }>(
    drizzleSql`select pg_backend_pid()::int as pid`,
  );
  const pid = rows[0]?.pid;
  if (pid === undefined)
    throw new Error('Failed to read PostgreSQL backend pid');
  return pid;
}

async function waitForReconciliationState(input: {
  pid: number;
  customerLockObserved: () => boolean;
}): Promise<'customer-lock-held' | 'waiting-on-advisory'> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (input.customerLockObserved()) return 'customer-lock-held';

    const rows = await control.db.execute<{ waiting: boolean }>(drizzleSql`
      select exists (
        select 1
        from pg_locks
        where pid = ${input.pid}
          and locktype = 'advisory'
          and not granted
      ) as waiting
    `);
    if (rows[0]?.waiting) return 'waiting-on-advisory';

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error('Reconciliation writer did not reach a lock wait');
}

async function waitForDeletionLockState(
  pid: number,
): Promise<'waiting-on-advisory' | 'waiting-on-row-lock'> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const rows = await control.db.execute<{
      waitEventType: string | null;
      waitingOnAdvisory: boolean;
    }>(drizzleSql`
      select
        activity.wait_event_type as "waitEventType",
        exists (
          select 1
          from pg_locks
          where pid = ${pid}
            and locktype = 'advisory'
            and not granted
        ) as "waitingOnAdvisory"
      from pg_stat_activity activity
      where activity.pid = ${pid}
    `);
    const state = rows[0];
    if (state?.waitingOnAdvisory) return 'waiting-on-advisory';
    if (state?.waitEventType === 'Lock') return 'waiting-on-row-lock';

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error('Deletion writer did not reach a lock wait');
}

function findPostgresErrorCode(error: unknown): string | null {
  let current = error;
  for (let depth = 0; depth < 8; depth += 1) {
    if (typeof current !== 'object' || current === null) return null;
    const record = current as { code?: unknown; cause?: unknown };
    if (typeof record.code === 'string' && /^[0-9A-Z]{5}$/.test(record.code)) {
      return record.code;
    }
    current = record.cause;
  }
  return null;
}

function stripeSubscription(input: {
  userId: string;
  externalCustomerId: string;
  externalSubscriptionId: string;
}) {
  return {
    id: input.externalSubscriptionId,
    customer: input.externalCustomerId,
    status: 'active' as const,
    cancel_at_period_end: false,
    metadata: { user_id: input.userId },
    items: {
      data: [
        {
          current_period_end: 1_893_456_000,
          price: { id: priceIds.monthly },
        },
      ],
    },
  };
}

function createReconciliationStripeClient(
  subscription: ReturnType<typeof stripeSubscription>,
): ReconcileStripeSubscriptionsDeps['stripe'] {
  function unexpectedCall(operation: string): never {
    throw new Error(`Unexpected Stripe call: ${operation}`);
  }

  return {
    customers: {
      create: async () => unexpectedCall('customers.create'),
    },
    checkout: {
      sessions: {
        create: async () => unexpectedCall('checkout.sessions.create'),
        list: async () => unexpectedCall('checkout.sessions.list'),
        retrieve: async () => unexpectedCall('checkout.sessions.retrieve'),
        expire: async () => unexpectedCall('checkout.sessions.expire'),
      },
    },
    subscriptions: {
      retrieve: async () => subscription,
      list: async () => ({
        data: [{ id: subscription.id, status: subscription.status }],
      }),
      cancel: async () => subscription,
    },
    billingPortal: {
      sessions: {
        create: async () => unexpectedCall('billingPortal.sessions.create'),
      },
    },
    webhooks: {
      constructEvent: () => unexpectedCall('webhooks.constructEvent'),
    },
  };
}

async function runWebhookWriter(input: {
  userId: string;
  externalCustomerId: string;
  externalSubscriptionId: string;
  eventId: string;
  lockHeld: () => void;
  release: Promise<void>;
  deletionCounterparty?: boolean;
}): Promise<void> {
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

async function runCheckoutSuccessWriter(input: {
  userId: string;
  email: string;
  externalCustomerId: string;
  externalSubscriptionId: string;
  lockHeld: () => void;
  release: Promise<void>;
}): Promise<void> {
  const subscription = stripeSubscription(input);
  const authGateway = new FakeAuthGateway({
    id: input.userId,
    email: input.email,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const deps: CheckoutSuccessDeps = {
    authGateway,
    subscriptionVersions: new DrizzleSubscriptionRepository(
      subscriptionWriter.db,
      priceIds,
    ),
    getClerkAuth: async () => ({
      userId: input.userId,
      redirectToSignIn: () => {
        throw new Error('Unexpected sign-in redirect');
      },
    }),
    logger: new FakeLogger(),
    stripe: {
      checkout: {
        sessions: {
          retrieve: async () => ({
            customer: input.externalCustomerId,
            subscription: input.externalSubscriptionId,
          }),
        },
      },
      subscriptions: { retrieve: async () => subscription },
    },
    priceIds,
    appUrl: 'http://localhost:3000',
    transaction: async (fn) =>
      subscriptionWriter.db.transaction(async (tx) => {
        await configureSubscriptionWriter(tx);
        return fn({
          subscriptions: new PausingSubscriptionRepository(
            tx,
            input.lockHeld,
            input.release,
          ),
          stripeCustomers: new DrizzleStripeCustomerRepository(tx),
        });
      }),
  };

  await syncCheckoutSuccess({ sessionId: 'cs_lock_order' }, deps, () => {
    throw new Error('Unexpected checkout redirect');
  });
}

async function runReconciliationWriter(input: {
  userId: string;
  externalCustomerId: string;
  externalSubscriptionId: string;
  lockHeld: () => void;
  release: Promise<void>;
  onTransactionError: (error: unknown) => void;
}) {
  const normalizedSubscription = stripeSubscription(input);

  return reconcileStripeSubscriptions(
    { limit: 1, offset: 0, dryRun: true, concurrency: 1 },
    {
      stripe: createReconciliationStripeClient(normalizedSubscription),
      priceIds,
      logger: new FakeLogger(),
      now: () => new Date('2026-08-07T12:00:00.000Z'),
      listLocalSubscriptions: async () => [
        {
          userId: input.userId,
          stripeSubscriptionId: input.externalSubscriptionId,
          version: null,
        },
      ],
      transaction: async (fn) => {
        try {
          return await reconciliationWriter.db.transaction(async (tx) => {
            await configureSubscriptionWriter(tx);
            return fn({
              subscriptions:
                new PausingDeletionCounterpartySubscriptionRepository(
                  tx,
                  input.lockHeld,
                  input.release,
                ),
              stripeCustomers:
                new RawDeletionCounterpartyStripeCustomerRepository(tx),
              renewalConsentRecords: new DrizzleRenewalConsentRecordRepository(
                tx,
              ),
            });
          });
        } catch (error) {
          input.onTransactionError(error);
          throw error;
        }
      },
    },
  );
}

async function runDeletionWriter(input: {
  clerkUserId: string;
  eventId: string;
  backendPid: (pid: number) => void;
  customerRead: () => void;
  release: Promise<void>;
}): Promise<void> {
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
      getClerkUserById: async () => null,
      logger: new FakeLogger(),
    },
    {
      eventId: input.eventId,
      type: 'user.deleted',
      data: { id: input.clerkUserId },
    },
  );
}

async function runFirstInsertWebhookWriter(input: {
  userId: string;
  externalCustomerId: string;
  externalSubscriptionId: string;
  eventId: string;
  backendPid: (pid: number) => void;
}): Promise<void> {
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
        subscriptionWriter.db,
        priceIds,
      ),
      logger: new FakeLogger(),
      now: () => new Date(),
      ...acknowledgment.webhook,
      transaction: async (fn) =>
        subscriptionWriter.db.transaction(async (tx) => {
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

afterEach(async () => {
  if (clerkEventIds.length > 0) {
    await control.db
      .delete(schema.clerkEvents)
      .where(inArray(schema.clerkEvents.id, clerkEventIds));
    clerkEventIds.length = 0;
  }
  if (deletedClerkUserIds.length > 0) {
    await control.db
      .delete(schema.deletedClerkUsers)
      .where(
        inArray(schema.deletedClerkUsers.clerkUserId, deletedClerkUserIds),
      );
    deletedClerkUserIds.length = 0;
  }
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

describe('Stripe subscription writer lock order', () => {
  it.each(['webhook', 'reconcile'] as const)(
    'serializes the deletion writer and %s writer without a 40P01 deadlock',
    async (writerKind) => {
      const user = await createUser(control.db, cleanup);
      const storedUser = await control.db.query.users.findFirst({
        columns: { clerkUserId: true },
        where: eq(schema.users.id, user.id),
      });
      if (!storedUser) throw new Error('Failed to reload integration user');

      const externalCustomerId = `cus_${randomUUID().replaceAll('-', '')}`;
      const externalSubscriptionId = `sub_${randomUUID().replaceAll('-', '')}`;
      const stripeEventId = `evt_${randomUUID().replaceAll('-', '')}`;
      const clerkEventId = `evt_${randomUUID().replaceAll('-', '')}`;
      if (writerKind === 'webhook') {
        cleanup.stripeEventIds.push(stripeEventId);
      }
      clerkEventIds.push(clerkEventId);
      deletedClerkUserIds.push(storedUser.clerkUserId);

      await new DrizzleStripeCustomerRepository(control.db).insert(
        user.id,
        externalCustomerId,
      );
      await new DrizzleSubscriptionRepository(control.db, priceIds).upsert({
        userId: user.id,
        externalSubscriptionId,
        plan: 'monthly',
        status: 'active',
        expectedVersion: null,
        currentPeriodEnd: new Date('2029-01-01T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
      });

      const counterpartyLockHeld = createDeferred<void>();
      const releaseCounterparty = createDeferred<void>();
      let reconciliationTransactionError: unknown;
      const counterpartyPromise =
        writerKind === 'webhook'
          ? runWebhookWriter({
              userId: user.id,
              externalCustomerId,
              externalSubscriptionId,
              eventId: stripeEventId,
              lockHeld: () => counterpartyLockHeld.resolve(),
              release: releaseCounterparty.promise,
              deletionCounterparty: true,
            })
          : runReconciliationWriter({
              userId: user.id,
              externalCustomerId,
              externalSubscriptionId,
              lockHeld: () => counterpartyLockHeld.resolve(),
              release: releaseCounterparty.promise,
              onTransactionError: (error) => {
                reconciliationTransactionError = error;
              },
            });
      await counterpartyLockHeld.promise;

      // The deletion writer now takes the advisory before any users-row lock,
      // so it must queue at the advisory while the counterparty holds it; the
      // customer-read pause is pre-released because it happens under the lock.
      const releaseDeletion = createDeferred<void>();
      releaseDeletion.resolve();
      const deletionPid = createDeferred<number>();
      const deletionPromise = runDeletionWriter({
        clerkUserId: storedUser.clerkUserId,
        eventId: clerkEventId,
        backendPid: (pid) => deletionPid.resolve(pid),
        customerRead: () => undefined,
        release: releaseDeletion.promise,
      });

      const deletionState = await waitForDeletionLockState(
        await deletionPid.promise,
      );
      releaseCounterparty.resolve();

      const [counterpartyResult, deletionResult] = await Promise.allSettled([
        counterpartyPromise,
        deletionPromise,
      ]);
      const postgresErrorCodes = [
        reconciliationTransactionError,
        counterpartyResult.status === 'rejected'
          ? counterpartyResult.reason
          : null,
        deletionResult.status === 'rejected' ? deletionResult.reason : null,
      ]
        .map(findPostgresErrorCode)
        .filter((code): code is string => code !== null);

      expect(postgresErrorCodes).not.toContain('40P01');
      expect(deletionState).toBe('waiting-on-advisory');
      expect(counterpartyResult.status).toBe('fulfilled');
      expect(deletionResult.status).toBe('fulfilled');
      if (writerKind === 'reconcile') {
        expect(counterpartyResult).toMatchObject({
          status: 'fulfilled',
          value: { updated: 1, failed: 0 },
        });
      }
    },
  );

  it('serializes the deletion writer and a first-insert webhook writer at the advisory lock', async () => {
    const user = await createUser(control.db, cleanup);
    const storedUser = await control.db.query.users.findFirst({
      columns: { clerkUserId: true },
      where: eq(schema.users.id, user.id),
    });
    if (!storedUser) throw new Error('Failed to reload integration user');

    const externalCustomerId = `cus_${randomUUID().replaceAll('-', '')}`;
    const externalSubscriptionId = `sub_${randomUUID().replaceAll('-', '')}`;
    const stripeEventId = `evt_${randomUUID().replaceAll('-', '')}`;
    const clerkEventId = `evt_${randomUUID().replaceAll('-', '')}`;
    cleanup.stripeEventIds.push(stripeEventId);
    clerkEventIds.push(clerkEventId);
    deletedClerkUserIds.push(storedUser.clerkUserId);

    // Seed ONLY the customer mapping: with no stripe_subscriptions row the
    // counterparty's production upsert takes the INSERT path, whose FK check
    // share-locks the users row the deletion writer holds FOR UPDATE.
    await new DrizzleStripeCustomerRepository(control.db).insert(
      user.id,
      externalCustomerId,
    );

    const deletionCustomerRead = createDeferred<void>();
    const releaseDeletion = createDeferred<void>();
    const deletionPid = createDeferred<number>();
    const deletionPromise = runDeletionWriter({
      clerkUserId: storedUser.clerkUserId,
      eventId: clerkEventId,
      backendPid: (pid) => deletionPid.resolve(pid),
      customerRead: () => deletionCustomerRead.resolve(),
      release: releaseDeletion.promise,
    });
    await deletionCustomerRead.promise;

    const counterpartyPid = createDeferred<number>();
    const counterpartyPromise = runFirstInsertWebhookWriter({
      userId: user.id,
      externalCustomerId,
      externalSubscriptionId,
      eventId: stripeEventId,
      backendPid: (pid) => counterpartyPid.resolve(pid),
    });

    // The conforming counterparty must queue at the advisory lock, never at
    // the users-row share lock inside its INSERT (the pre-fix AB-BA edge).
    const counterpartyState = await waitForDeletionLockState(
      await counterpartyPid.promise,
    );
    releaseDeletion.resolve();

    const [deletionResult, counterpartyResult] = await Promise.allSettled([
      deletionPromise,
      counterpartyPromise,
    ]);

    expect(counterpartyState).toBe('waiting-on-advisory');
    expect(deletionResult.status).toBe('fulfilled');
    // The counterparty loses to the committed deletion at the missing-user
    // FK without a 40P01 deadlock. BUG-296 classifies that exact FK and
    // acknowledges the terminal webhook instead of surfacing a 500.
    expect(counterpartyResult.status).toBe('fulfilled');
    await expect(
      control.db.query.users.findFirst({
        where: eq(schema.users.id, user.id),
      }),
    ).resolves.toBeUndefined();
    await expect(
      control.db.query.stripeSubscriptions.findFirst({
        where: eq(schema.stripeSubscriptions.userId, user.id),
      }),
    ).resolves.toBeUndefined();
    await expect(
      control.db.query.stripeEvents.findFirst({
        where: eq(schema.stripeEvents.id, stripeEventId),
      }),
    ).resolves.toMatchObject({
      processedAt: expect.any(Date),
      error: null,
    });
  });

  it.each(['webhook', 'checkout-success'] as const)(
    'serializes the %s and reconcile writers without a 40P01 deadlock',
    async (writerKind) => {
      const user = await createUser(control.db, cleanup);
      const externalCustomerId = `cus_${randomUUID().replaceAll('-', '')}`;
      const externalSubscriptionId = `sub_${randomUUID().replaceAll('-', '')}`;
      const eventId = `evt_${randomUUID().replaceAll('-', '')}`;
      if (writerKind === 'webhook') cleanup.stripeEventIds.push(eventId);

      await new DrizzleStripeCustomerRepository(control.db).insert(
        user.id,
        externalCustomerId,
      );

      const writerLockHeld = createDeferred<void>();
      const releaseWriter = createDeferred<void>();
      const reconciliationPid = createDeferred<number>();
      let customerLockObserved = false;
      let reconciliationTransactionError: unknown;

      const writerPromise =
        writerKind === 'webhook'
          ? runWebhookWriter({
              userId: user.id,
              externalCustomerId,
              externalSubscriptionId,
              eventId,
              lockHeld: () => writerLockHeld.resolve(),
              release: releaseWriter.promise,
            })
          : runCheckoutSuccessWriter({
              userId: user.id,
              email: user.email,
              externalCustomerId,
              externalSubscriptionId,
              lockHeld: () => writerLockHeld.resolve(),
              release: releaseWriter.promise,
            });

      await writerLockHeld.promise;

      const normalizedSubscription = stripeSubscription({
        userId: user.id,
        externalCustomerId,
        externalSubscriptionId,
      });
      const stripe = createReconciliationStripeClient(normalizedSubscription);

      const reconciliationPromise = reconcileStripeSubscriptions(
        { limit: 1, offset: 0, dryRun: true, concurrency: 1 },
        {
          stripe,
          priceIds,
          logger: new FakeLogger(),
          now: () => new Date('2026-08-07T12:00:00.000Z'),
          listLocalSubscriptions: async () => [
            {
              userId: user.id,
              stripeSubscriptionId: externalSubscriptionId,
              version: null,
            },
          ],
          transaction: async (fn) => {
            try {
              return await reconciliationWriter.db.transaction(async (tx) => {
                await configureFastDeadlockWriter(tx);
                reconciliationPid.resolve(await getBackendPid(tx));
                return fn({
                  subscriptions: new DrizzleSubscriptionRepository(
                    tx,
                    priceIds,
                  ),
                  stripeCustomers: new ObservedStripeCustomerRepository(
                    tx,
                    () => {
                      customerLockObserved = true;
                    },
                  ),
                  renewalConsentRecords:
                    new DrizzleRenewalConsentRecordRepository(tx),
                });
              });
            } catch (error) {
              reconciliationTransactionError = error;
              throw error;
            }
          },
        },
      );

      const pid = await reconciliationPid.promise;
      let state: Awaited<ReturnType<typeof waitForReconciliationState>>;
      try {
        state = await waitForReconciliationState({
          pid,
          customerLockObserved: () => customerLockObserved,
        });
      } finally {
        releaseWriter.resolve();
      }

      const [writerResult, reconciliationResult] = await Promise.allSettled([
        writerPromise,
        reconciliationPromise,
      ]);
      const postgresErrorCodes = [
        reconciliationTransactionError,
        writerResult.status === 'rejected' ? writerResult.reason : null,
      ]
        .map(findPostgresErrorCode)
        .filter((code): code is string => code !== null);

      expect(postgresErrorCodes).toEqual([]);
      expect(state).toBe('waiting-on-advisory');
      expect(writerResult.status).toBe('fulfilled');
      expect(reconciliationResult).toMatchObject({
        status: 'fulfilled',
        value: { updated: 1, failed: 0 },
      });
    },
  );
});
