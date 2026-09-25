import { describe, expect, it } from 'vitest';
import { FakeStripeCheckoutClient } from '@/src/adapters/gateways/stripe/test-helpers/fake-stripe-checkout-client';
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
const externalCustomerId = 'cus_reconcile_version_fence';

// The one Subscription the local row points at, seeded on the maintained fake:
// the job retrieves it by id and lists the customer's Subscriptions, where it
// appears as the only blocking one.
function createStripe(): FakeStripeCheckoutClient {
  const stripe = new FakeStripeCheckoutClient();
  stripe.seedSubscription({
    id: externalSubscriptionId,
    customer: externalCustomerId,
    status: 'active',
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
  });
  return stripe;
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
          stripe,
          initialVersion: 4,
        }),
      ),
    ).resolves.toMatchObject({ updated: 1, failed: 0 });

    expect(stripe.subscriptions.retrieveCalls).toEqual([
      externalSubscriptionId,
      externalSubscriptionId,
    ]);
    expect(stripe.subscriptions.listCalls).toEqual([
      expect.objectContaining({ customer: externalCustomerId, status: 'all' }),
      expect.objectContaining({ customer: externalCustomerId, status: 'all' }),
    ]);
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
        stripe,
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
    expect(stripe.subscriptions.retrieveCalls).toHaveLength(
      SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS,
    );
    expect(stripe.subscriptions.listCalls).toHaveLength(
      SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS,
    );
    expect(subscriptions.inputs).toHaveLength(
      SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS,
    );
  });
});
