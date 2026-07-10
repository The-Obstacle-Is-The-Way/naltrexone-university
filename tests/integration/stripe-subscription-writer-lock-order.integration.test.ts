import { randomUUID } from 'node:crypto';
import { sql as drizzleSql } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  type CheckoutSuccessDeps,
  syncCheckoutSuccess,
} from '@/app/(marketing)/checkout/success/checkout-success-sync';
import { processStripeWebhook } from '@/src/adapters/controllers/stripe-webhook-controller';
import { reconcileStripeSubscriptions } from '@/src/adapters/jobs/reconcile-stripe-subscriptions';
import type { ReconcileStripeSubscriptionsDeps } from '@/src/adapters/jobs/reconcile-stripe-subscriptions-types';
import { DrizzleStripeCustomerRepository } from '@/src/adapters/repositories/drizzle-stripe-customer-repository';
import { DrizzleStripeEventRepository } from '@/src/adapters/repositories/drizzle-stripe-event-repository';
import { DrizzleSubscriptionRepository } from '@/src/adapters/repositories/drizzle-subscription-repository';
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
const cleanup = createCleanupState();

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

async function configureReconciliationWriter(tx: DrizzleDb): Promise<void> {
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

  await processStripeWebhook(
    {
      paymentGateway,
      logger: new FakeLogger(),
      now: () => new Date(),
      transaction: async (fn) =>
        subscriptionWriter.db.transaction(async (tx) => {
          await configureSubscriptionWriter(tx);
          return fn({
            stripeEvents: new DrizzleStripeEventRepository(tx),
            subscriptions: new PausingSubscriptionRepository(
              tx,
              input.lockHeld,
              input.release,
            ),
            stripeCustomers: new DrizzleStripeCustomerRepository(tx),
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

afterEach(async () => {
  await cleanupAfterEach(control.db, cleanup);
});

afterAll(async () => {
  await Promise.all([
    closeConnection(control.sql),
    closeConnection(subscriptionWriter.sql),
    closeConnection(reconciliationWriter.sql),
  ]);
});

describe('Stripe subscription writer lock order', () => {
  it.each([
    'webhook',
    'checkout-success',
  ] as const)('serializes the %s and reconcile writers without a 40P01 deadlock', async (writerKind) => {
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
        listLocalSubscriptions: async () => [
          { userId: user.id, stripeSubscriptionId: externalSubscriptionId },
        ],
        transaction: async (fn) => {
          try {
            return await reconciliationWriter.db.transaction(async (tx) => {
              await configureReconciliationWriter(tx);
              reconciliationPid.resolve(await getBackendPid(tx));
              return fn({
                subscriptions: new DrizzleSubscriptionRepository(tx, priceIds),
                stripeCustomers: new ObservedStripeCustomerRepository(
                  tx,
                  () => {
                    customerLockObserved = true;
                  },
                ),
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
  });
});
