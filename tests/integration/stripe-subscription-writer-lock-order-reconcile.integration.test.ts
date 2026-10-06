import { randomUUID } from 'node:crypto';
import { sql as drizzleSql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  type CheckoutSuccessDeps,
  syncCheckoutSuccess,
} from '@/app/(marketing)/checkout/success/checkout-success-sync';
import { FakeStripeCheckoutClient } from '@/src/adapters/gateways/stripe/test-helpers/fake-stripe-checkout-client';
import { reconcileStripeSubscriptions } from '@/src/adapters/jobs/reconcile-stripe-subscriptions';
import { DrizzleRenewalConsentRecordRepository } from '@/src/adapters/repositories/drizzle-renewal-consent-record-repository';
import { DrizzleStripeCustomerRepository } from '@/src/adapters/repositories/drizzle-stripe-customer-repository';
import { DrizzleSubscriptionRepository } from '@/src/adapters/repositories/drizzle-subscription-repository';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';
import {
  FakeAuthGateway,
  FakeLogger,
  FakeRateLimiter,
} from '@/src/application/test-helpers/fakes';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { createUser } from './helpers';
import {
  configureFastDeadlockWriter,
  configureSubscriptionWriter,
  createLockOrderHarness,
  type DeletionRaceFixture,
  getBackendPid,
  PausingDeletionCounterpartySubscriptionRepository,
  PausingSubscriptionRepository,
  priceIds,
  RawDeletionCounterpartyStripeCustomerRepository,
} from './stripe-subscription-writer-lock-order-test-helpers';

// Writers racing the reconciliation job. The deletion-writer and first-insert
// webhook races are in stripe-subscription-writer-lock-order-deletion.
const harness = createLockOrderHarness();

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

async function waitForReconciliationState(input: {
  pid: number;
  customerLockObserved: () => boolean;
}): Promise<'customer-lock-held' | 'waiting-on-advisory'> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (input.customerLockObserved()) return 'customer-lock-held';

    const rows = await harness.control.db.execute<{
      waiting: boolean;
    }>(drizzleSql`
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
    start_date: 1_696_000_000,
    billing_cycle_anchor: 1_696_604_800,
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

// The reconciliation job retrieves and lists this one Subscription; the
// maintained fake answers both from its seeded state.
function createReconciliationStripeClient(
  subscription: ReturnType<typeof stripeSubscription>,
): FakeStripeCheckoutClient {
  const stripe = new FakeStripeCheckoutClient();
  stripe.seedSubscription(subscription);
  return stripe;
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
      harness.subscriptionWriter.db,
      priceIds,
    ),
    rateLimiter: new FakeRateLimiter(),
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
      harness.subscriptionWriter.db.transaction(async (tx) => {
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

async function runReconciliationWriter(
  input: DeletionRaceFixture & {
    lockHeld: () => void;
    release: Promise<void>;
    onTransactionError: (error: unknown) => void;
  },
) {
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
          return await harness.reconciliationWriter.db.transaction(
            async (tx) => {
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
                renewalConsentRecords:
                  new DrizzleRenewalConsentRecordRepository(tx),
              });
            },
          );
        } catch (error) {
          input.onTransactionError(error);
          throw error;
        }
      },
    },
  );
}

describe('Stripe subscription writer lock order', () => {
  it('serializes the deletion writer and reconcile writer without a 40P01 deadlock', async () => {
    let reconciliationTransactionError: unknown;
    const { counterparty, deletion } = await harness.raceDeletionWriter({
      customerMapping: 'seeded',
      startCounterparty: (fixture, lockHeld, release) =>
        runReconciliationWriter({
          ...fixture,
          lockHeld,
          release,
          onTransactionError: (error) => {
            reconciliationTransactionError = error;
          },
        }),
    });

    // A 40P01 deadlock would fail the reconciliation transaction or reject a
    // writer.
    expect(reconciliationTransactionError).toBeUndefined();
    expect(deletion).toMatchObject({ status: 'fulfilled' });
    expect(counterparty).toMatchObject({
      status: 'fulfilled',
      value: { updated: 1, failed: 0 },
    });
  });

  it.each(['webhook', 'checkout-success'] as const)(
    'serializes the %s and reconcile writers without a 40P01 deadlock',
    async (writerKind) => {
      const user = await createUser(harness.control.db, harness.cleanup);
      const externalCustomerId = `cus_${randomUUID().replaceAll('-', '')}`;
      const externalSubscriptionId = `sub_${randomUUID().replaceAll('-', '')}`;
      const eventId = `evt_${randomUUID().replaceAll('-', '')}`;

      await new DrizzleStripeCustomerRepository(harness.control.db).insert(
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
          ? harness.runWebhookWriter({
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
              return await harness.reconciliationWriter.db.transaction(
                async (tx) => {
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
                },
              );
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
      // A 40P01 deadlock would fail the reconciliation transaction or reject
      // the writer.
      expect(reconciliationTransactionError).toBeUndefined();
      expect(state).toBe('waiting-on-advisory');
      expect(writerResult.status).toBe('fulfilled');
      expect(reconciliationResult).toMatchObject({
        status: 'fulfilled',
        value: { updated: 1, failed: 0 },
      });
    },
  );
});
