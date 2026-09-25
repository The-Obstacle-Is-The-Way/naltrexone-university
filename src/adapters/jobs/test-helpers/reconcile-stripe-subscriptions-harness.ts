import { expect } from 'vitest';
import { FakeStripeCheckoutClient } from '@/src/adapters/gateways/stripe/test-helpers/fake-stripe-checkout-client';
import type { StripeSubscriptionStatus } from '@/src/adapters/shared/stripe-types';
import {
  FakeLogger,
  FakeRenewalConsentRecordRepository,
  FakeStripeCustomerRepository,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import { loadJsonFixture } from '@/tests/shared/load-json-fixture';
import { reconcileStripeSubscriptions } from '../reconcile-stripe-subscriptions';

export type StripeSubscriptionFixture = {
  id: string;
  customer: string;
  status: StripeSubscriptionStatus;
  cancel_at_period_end: boolean;
  metadata?: Record<string, string>;
  items: {
    data: Array<{
      current_period_end: number;
      price: { id: string };
    }>;
  };
};

type LocalSubscriptionRow = {
  userId: string;
  stripeSubscriptionId: string;
  version: number | null;
};

type ReconciliationInput = Parameters<typeof reconcileStripeSubscriptions>[0];
type ReconciliationDeps = Parameters<typeof reconcileStripeSubscriptions>[1];

export const primaryUserId = crypto.randomUUID();
export const secondaryUserId = crypto.randomUUID();
export const tertiaryUserId = crypto.randomUUID();
export const otherUserId = crypto.randomUUID();

// A Stripe Subscription built from the webhook fixture, owned by `userId`
// through metadata. Every fixture shares customer `cus_123` unless a case
// gives it its own, so the job's customer listing finds them together.
export function createUserSubscriptionFixture(
  id: string,
  input: {
    userId?: string;
    customerId?: string;
    status?: StripeSubscriptionStatus;
    currentPeriodEnd?: number;
    e2eOwner?: string;
  } = {},
): StripeSubscriptionFixture {
  const subscriptionEvent = loadJsonFixture<{
    data: { object: StripeSubscriptionFixture };
  }>('stripe/customer.subscription.updated.json');
  const base = subscriptionEvent.data.object;
  const [baseItem] = base.items.data;

  return {
    ...base,
    id,
    customer: input.customerId ?? 'cus_123',
    status: input.status ?? 'active',
    metadata: {
      ...base.metadata,
      user_id: input.userId ?? primaryUserId,
      ...(input.e2eOwner ? { e2e_owner: input.e2eOwner } : {}),
    },
    items: {
      ...base.items,
      data: [
        {
          ...baseItem,
          current_period_end: input.currentPeriodEnd ?? 1_700_000_000,
          price: { ...baseItem?.price, id: 'price_m' },
        },
      ],
    },
  };
}

// The maintained fake with the given Subscriptions seeded in order; the job
// lists a customer's Subscriptions in that order.
export function createStripeWithSubscriptions(
  subscriptions: readonly StripeSubscriptionFixture[],
): FakeStripeCheckoutClient {
  const stripe = new FakeStripeCheckoutClient();
  for (const subscription of subscriptions) {
    stripe.seedSubscription(subscription);
  }
  return stripe;
}

export function row(
  userId: string,
  stripeSubscriptionId: string,
): LocalSubscriptionRow {
  return { userId, stripeSubscriptionId, version: null };
}

export function createReconciliationTestScenario(input: {
  stripe: ReconciliationDeps['stripe'];
  localSubscriptions?: LocalSubscriptionRow[];
  listLocalSubscriptions?: ReconciliationDeps['listLocalSubscriptions'];
  stripeCustomers?: FakeStripeCustomerRepository;
  subscriptions?: FakeSubscriptionRepository;
  renewalConsentRecords?: FakeRenewalConsentRecordRepository;
  transaction?: ReconciliationDeps['transaction'];
  webhookE2EOwner?: string;
}) {
  const stripeCustomers =
    input.stripeCustomers ?? new FakeStripeCustomerRepository();
  const subscriptions = input.subscriptions ?? new FakeSubscriptionRepository();
  const renewalConsentRecords =
    input.renewalConsentRecords ?? new FakeRenewalConsentRecordRepository();
  const logger = new FakeLogger();
  const listLocalSubscriptions =
    input.listLocalSubscriptions ??
    (async () => input.localSubscriptions ?? []);
  const transaction: ReconciliationDeps['transaction'] =
    input.transaction ??
    (async (fn) =>
      fn({ stripeCustomers, subscriptions, renewalConsentRecords }));

  async function run(overrides: Partial<ReconciliationInput> = {}) {
    return reconcileStripeSubscriptions(
      { limit: 10, offset: 0, ...overrides },
      {
        stripe: input.stripe,
        priceIds: { monthly: 'price_m', annual: 'price_a' },
        logger,
        now: () => new Date('2026-08-07T12:00:00.000Z'),
        webhookE2EOwner: input.webhookE2EOwner,
        listLocalSubscriptions,
        transaction,
      },
    );
  }

  return { stripeCustomers, subscriptions, logger, run };
}

// One local row for the primary user pointing at the Subscription the case
// is about.
export function createSingleRowScenario(input: {
  stripe: ReconciliationDeps['stripe'];
  subscriptionId: string;
  stripeCustomers?: FakeStripeCustomerRepository;
}) {
  return createReconciliationTestScenario({
    stripe: input.stripe,
    ...(input.stripeCustomers
      ? { stripeCustomers: input.stripeCustomers }
      : {}),
    localSubscriptions: [row(primaryUserId, input.subscriptionId)],
  });
}

export async function expectDryRunSuccess(
  scenario: ReturnType<typeof createReconciliationTestScenario>,
): Promise<void> {
  await expect(scenario.run({ dryRun: true })).resolves.toMatchObject({
    updated: 1,
    failed: 0,
  });
}

export function expectSingleFailure(
  result: Awaited<
    ReturnType<ReturnType<typeof createReconciliationTestScenario>['run']>
  >,
  failure: { stripeSubscriptionId: string; error?: string },
): void {
  expect(result.updated).toBe(0);
  expect(result.failed).toBe(1);
  expect(result.failures).toHaveLength(1);
  expect(result.failures[0]).toMatchObject(failure);
}

// The idempotency key the job sends with each duplicate cancel.
export function duplicateCancel(subscriptionId: string) {
  return {
    subscriptionId,
    options: {
      idempotencyKey: `reconcile_duplicate_subscription:${subscriptionId}`,
    },
  };
}
