import { describe, expect, it } from 'vitest';
import type { ReconcileStripeSubscriptionsDeps } from '@/src/adapters/jobs/reconcile-stripe-subscriptions-types';
import type {
  SubscriptionUpsertInput,
  SubscriptionUpsertResult,
} from '@/src/application/ports/repositories';
import { SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS } from '@/src/application/shared/persist-subscription-observation';
import {
  FakeLogger,
  FakeRenewalConsentRecordRepository,
  FakeStripeCustomerRepository,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import { reconcileStripeSubscriptions } from './reconcile-stripe-subscriptions';

const userId = crypto.randomUUID();
const externalSubscriptionId = 'sub_reconcile_version_fence';

function stripeSubscription() {
  return {
    id: externalSubscriptionId,
    customer: 'cus_reconcile_version_fence',
    status: 'active' as const,
    cancel_at_period_end: false,
    metadata: { user_id: userId },
    items: {
      data: [
        {
          current_period_end: 1_893_456_000,
          price: { id: 'price_monthly' },
        },
      ],
    },
  };
}

function createStripe() {
  const subscription = stripeSubscription();
  let retrieveCount = 0;
  let listCount = 0;

  const stripe: ReconcileStripeSubscriptionsDeps['stripe'] = {
    customers: {
      create: async () => {
        throw new Error('Unexpected customers.create');
      },
    },
    checkout: {
      sessions: {
        create: async () => {
          throw new Error('Unexpected checkout.sessions.create');
        },
        list: async () => {
          throw new Error('Unexpected checkout.sessions.list');
        },
        retrieve: async () => {
          throw new Error('Unexpected checkout.sessions.retrieve');
        },
        expire: async () => {
          throw new Error('Unexpected checkout.sessions.expire');
        },
      },
    },
    subscriptions: {
      retrieve: async () => {
        retrieveCount += 1;
        return subscription;
      },
      list: async () => {
        listCount += 1;
        return { data: [] };
      },
      cancel: async () => subscription,
    },
    billingPortal: {
      sessions: {
        create: async () => {
          throw new Error('Unexpected billingPortal.sessions.create');
        },
      },
    },
    webhooks: {
      constructEvent: () => {
        throw new Error('Unexpected webhooks.constructEvent');
      },
    },
  };

  return {
    stripe,
    retrieveCount: () => retrieveCount,
    listCount: () => listCount,
  };
}

class VersionConflictSubscriptionRepository extends FakeSubscriptionRepository {
  readonly inputs: SubscriptionUpsertInput[] = [];
  private versionReadCount = 0;

  constructor(private readonly conflictsBeforeSuccess: number) {
    super();
  }

  override async findObservationVersionByUserId(): Promise<number> {
    this.versionReadCount += 1;
    return 4 + this.versionReadCount;
  }

  override async upsert(
    input: SubscriptionUpsertInput,
  ): Promise<SubscriptionUpsertResult> {
    this.inputs.push(input);
    if (this.inputs.length <= this.conflictsBeforeSuccess) {
      return { persisted: false, reason: 'version_conflict' };
    }
    return { persisted: true };
  }
}

function createDeps(input: {
  subscriptions: VersionConflictSubscriptionRepository;
  stripe: ReconcileStripeSubscriptionsDeps['stripe'];
  initialVersion: number;
}): ReconcileStripeSubscriptionsDeps {
  const stripeCustomers = new FakeStripeCustomerRepository();
  const renewalConsentRecords = new FakeRenewalConsentRecordRepository();

  return {
    stripe: input.stripe,
    priceIds: { monthly: 'price_monthly', annual: 'price_annual' },
    logger: new FakeLogger(),
    now: () => new Date('2026-08-07T12:00:00.000Z'),
    listLocalSubscriptions: async () => [
      {
        userId,
        stripeSubscriptionId: externalSubscriptionId,
        version: input.initialVersion,
      },
    ],
    transaction: async (fn) =>
      fn({
        subscriptions: input.subscriptions,
        stripeCustomers,
        renewalConsentRecords,
      }),
  };
}

describe('reconcileStripeSubscriptions observation-version fence', () => {
  it('re-runs retrieval and converges after a version conflict', async () => {
    const stripe = createStripe();
    const subscriptions = new VersionConflictSubscriptionRepository(1);

    await expect(
      reconcileStripeSubscriptions(
        { limit: 1, offset: 0, dryRun: true, concurrency: 1 },
        createDeps({
          subscriptions,
          stripe: stripe.stripe,
          initialVersion: 4,
        }),
      ),
    ).resolves.toMatchObject({ updated: 1, failed: 0 });

    expect(stripe.retrieveCount()).toBe(2);
    expect(stripe.listCount()).toBe(2);
    expect(subscriptions.inputs.map((input) => input.expectedVersion)).toEqual([
      4, 5,
    ]);
  });

  it('counts retry exhaustion as the existing per-row failure shape', async () => {
    const stripe = createStripe();
    const subscriptions = new VersionConflictSubscriptionRepository(
      SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS,
    );

    const result = await reconcileStripeSubscriptions(
      { limit: 1, offset: 0, dryRun: true, concurrency: 1 },
      createDeps({
        subscriptions,
        stripe: stripe.stripe,
        initialVersion: 4,
      }),
    );

    expect(result).toMatchObject({
      updated: 0,
      failed: 1,
      failures: [
        {
          stripeSubscriptionId: externalSubscriptionId,
          error: `Subscription observation version conflicted after ${SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS} attempts`,
        },
      ],
    });
    expect(stripe.retrieveCount()).toBe(SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS);
    expect(stripe.listCount()).toBe(SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS);
    expect(subscriptions.inputs).toHaveLength(
      SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS,
    );
  });
});
