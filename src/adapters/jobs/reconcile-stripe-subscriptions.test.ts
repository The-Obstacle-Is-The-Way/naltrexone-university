import { describe, expect, it, vi } from 'vitest';
import type { StripeSubscriptionStatus } from '@/src/adapters/shared/stripe-types';
import {
  FakeLogger,
  FakeStripeCustomerRepository,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import { loadJsonFixture } from '@/tests/shared/load-json-fixture';
import { reconcileStripeSubscriptions } from './reconcile-stripe-subscriptions';

type StripeSubscriptionFixture = {
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

function createSubscriptionFixture(input: {
  id: string;
  userId: string;
  customerId?: string;
  status?: StripeSubscriptionStatus;
  currentPeriodEnd?: number;
  priceId?: string;
}): StripeSubscriptionFixture {
  const subscriptionEvent = loadJsonFixture<{
    data: { object: StripeSubscriptionFixture };
  }>('stripe/customer.subscription.updated.json');
  const base = subscriptionEvent.data.object;

  return {
    ...base,
    id: input.id,
    customer: input.customerId ?? 'cus_123',
    status: input.status ?? 'active',
    metadata: { ...(base.metadata ?? {}), user_id: input.userId },
    items: {
      ...base.items,
      data: [
        {
          ...base.items.data[0],
          current_period_end: input.currentPeriodEnd ?? 1_700_000_000,
          price: {
            ...base.items.data[0].price,
            id: input.priceId ?? 'price_m',
          },
        },
      ],
    },
  };
}

function createStripeStub(input: {
  subscriptionsById: Record<string, StripeSubscriptionFixture>;
  listedSubscriptions: Array<{
    id: string;
    status: StripeSubscriptionStatus;
  }>;
}) {
  return {
    subscriptions: {
      retrieve: vi.fn(async (subscriptionId: string) => {
        const subscription = input.subscriptionsById[subscriptionId];
        if (!subscription) {
          throw new Error(`Unknown subscription: ${subscriptionId}`);
        }
        return subscription;
      }),
      list: vi.fn(async () => ({ data: input.listedSubscriptions })),
      cancel: vi.fn(async () => ({ id: 'sub_canceled' })),
    },
    customers: {
      create: vi.fn(async () => ({ id: 'cus_unused' })),
    },
    checkout: {
      sessions: {
        create: vi.fn(async () => ({ id: 'cs_unused', url: null })),
        list: vi.fn(async () => ({ data: [] })),
        retrieve: vi.fn(async () => ({ id: 'cs_unused', url: null })),
        expire: vi.fn(async () => ({ id: 'cs_unused', url: null })),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn(async () => ({ url: null })),
      },
    },
    webhooks: {
      constructEvent: vi.fn(() => ({
        id: 'evt_unused',
        type: 'unused',
        data: { object: {} },
      })),
    },
  } as const;
}

describe('reconcileStripeSubscriptions', () => {
  it('upserts subscriptions and customer mappings for local subscriptions', async () => {
    const subscription = createSubscriptionFixture({
      id: 'sub_123',
      userId: 'user_1',
    });
    const stripe = createStripeStub({
      subscriptionsById: { sub_123: subscription },
      listedSubscriptions: [{ id: 'sub_123', status: 'active' }],
    });

    const stripeCustomers = new FakeStripeCustomerRepository();
    const subscriptions = new FakeSubscriptionRepository();

    const logger = new FakeLogger();
    const result = await reconcileStripeSubscriptions(
      { limit: 10, offset: 0 },
      {
        stripe,
        priceIds: { monthly: 'price_m', annual: 'price_a' },
        logger,
        listLocalSubscriptions: async () => [
          { userId: 'user_1', stripeSubscriptionId: 'sub_123' },
        ],
        transaction: async (fn) => fn({ stripeCustomers, subscriptions }),
      },
    );

    expect(result).toEqual({
      scanned: 1,
      updated: 1,
      failed: 0,
      failures: [],
    });

    await expect(subscriptions.findByUserId('user_1')).resolves.toMatchObject({
      userId: 'user_1',
      status: 'active',
      plan: 'monthly',
    });
    await expect(stripeCustomers.findByUserId('user_1')).resolves.toEqual({
      stripeCustomerId: 'cus_123',
    });
    expect(logger.errorCalls).toHaveLength(0);
  });

  it('cancels duplicate blocking subscriptions when dryRun is disabled', async () => {
    const keep = createSubscriptionFixture({
      id: 'sub_keep',
      userId: 'user_1',
      status: 'active',
      currentPeriodEnd: 1_700_000_000,
    });
    const duplicateOne = createSubscriptionFixture({
      id: 'sub_dup_1',
      userId: 'user_1',
      status: 'trialing',
      currentPeriodEnd: 1_700_000_100,
    });
    const duplicateTwo = createSubscriptionFixture({
      id: 'sub_dup_2',
      userId: 'user_1',
      status: 'past_due',
      currentPeriodEnd: 1_700_000_200,
    });

    const stripe = createStripeStub({
      subscriptionsById: {
        [keep.id]: keep,
        [duplicateOne.id]: duplicateOne,
        [duplicateTwo.id]: duplicateTwo,
      },
      listedSubscriptions: [
        { id: keep.id, status: keep.status },
        { id: duplicateOne.id, status: duplicateOne.status },
        { id: duplicateTwo.id, status: duplicateTwo.status },
      ],
    });

    const stripeCustomers = new FakeStripeCustomerRepository();
    const subscriptions = new FakeSubscriptionRepository();
    const logger = new FakeLogger();

    const result = await reconcileStripeSubscriptions(
      { limit: 10, offset: 0, dryRun: false },
      {
        stripe,
        priceIds: { monthly: 'price_m', annual: 'price_a' },
        logger,
        listLocalSubscriptions: async () => [
          { userId: 'user_1', stripeSubscriptionId: keep.id },
        ],
        transaction: async (fn) => fn({ stripeCustomers, subscriptions }),
      },
    );

    expect(result).toEqual({
      scanned: 1,
      updated: 1,
      failed: 0,
      failures: [],
    });
    expect(stripe.subscriptions.cancel).toHaveBeenCalledTimes(2);
    expect(stripe.subscriptions.cancel).toHaveBeenNthCalledWith(
      1,
      'sub_dup_1',
      { idempotencyKey: 'reconcile_duplicate_subscription:sub_dup_1' },
    );
    expect(stripe.subscriptions.cancel).toHaveBeenNthCalledWith(
      2,
      'sub_dup_2',
      { idempotencyKey: 'reconcile_duplicate_subscription:sub_dup_2' },
    );
  });

  it('does not cancel duplicate blocking subscriptions in dry-run mode', async () => {
    const keep = createSubscriptionFixture({
      id: 'sub_keep',
      userId: 'user_1',
      status: 'active',
    });
    const duplicate = createSubscriptionFixture({
      id: 'sub_dup',
      userId: 'user_1',
      status: 'trialing',
    });

    const stripe = createStripeStub({
      subscriptionsById: {
        [keep.id]: keep,
        [duplicate.id]: duplicate,
      },
      listedSubscriptions: [
        { id: keep.id, status: keep.status },
        { id: duplicate.id, status: duplicate.status },
      ],
    });

    const stripeCustomers = new FakeStripeCustomerRepository();
    const subscriptions = new FakeSubscriptionRepository();
    const logger = new FakeLogger();

    await expect(
      reconcileStripeSubscriptions(
        { limit: 10, offset: 0, dryRun: true },
        {
          stripe,
          priceIds: { monthly: 'price_m', annual: 'price_a' },
          logger,
          listLocalSubscriptions: async () => [
            { userId: 'user_1', stripeSubscriptionId: keep.id },
          ],
          transaction: async (fn) => fn({ stripeCustomers, subscriptions }),
        },
      ),
    ).resolves.toMatchObject({ updated: 1, failed: 0 });

    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it('replaces a stale non-blocking local subscription with the blocking Stripe subscription', async () => {
    const localCanceled = createSubscriptionFixture({
      id: 'sub_local_canceled',
      userId: 'user_1',
      status: 'canceled',
      currentPeriodEnd: 1_700_000_000,
    });
    const active = createSubscriptionFixture({
      id: 'sub_active',
      userId: 'user_1',
      status: 'active',
      currentPeriodEnd: 1_700_001_000,
    });

    const stripe = createStripeStub({
      subscriptionsById: {
        [localCanceled.id]: localCanceled,
        [active.id]: active,
      },
      listedSubscriptions: [{ id: active.id, status: active.status }],
    });

    const stripeCustomers = new FakeStripeCustomerRepository();
    const subscriptions = new FakeSubscriptionRepository();
    const logger = new FakeLogger();

    await expect(
      reconcileStripeSubscriptions(
        { limit: 10, offset: 0, dryRun: true },
        {
          stripe,
          priceIds: { monthly: 'price_m', annual: 'price_a' },
          logger,
          listLocalSubscriptions: async () => [
            { userId: 'user_1', stripeSubscriptionId: localCanceled.id },
          ],
          transaction: async (fn) => fn({ stripeCustomers, subscriptions }),
        },
      ),
    ).resolves.toMatchObject({ updated: 1, failed: 0 });

    await expect(subscriptions.findByUserId('user_1')).resolves.toMatchObject({
      status: 'active',
    });
    await expect(
      subscriptions.findByExternalSubscriptionId(active.id),
    ).resolves.toMatchObject({
      userId: 'user_1',
      status: 'active',
    });
    await expect(
      subscriptions.findByExternalSubscriptionId(localCanceled.id),
    ).resolves.toBeNull();
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it('reports a failure when Stripe subscription metadata user id mismatches', async () => {
    const mismatch = createSubscriptionFixture({
      id: 'sub_123',
      userId: 'user_other',
    });
    const stripe = createStripeStub({
      subscriptionsById: { sub_123: mismatch },
      listedSubscriptions: [{ id: 'sub_123', status: mismatch.status }],
    });

    const stripeCustomers = new FakeStripeCustomerRepository();
    const subscriptions = new FakeSubscriptionRepository();

    const logger = new FakeLogger();
    const result = await reconcileStripeSubscriptions(
      { limit: 10, offset: 0 },
      {
        stripe,
        priceIds: { monthly: 'price_m', annual: 'price_a' },
        logger,
        listLocalSubscriptions: async () => [
          { userId: 'user_1', stripeSubscriptionId: 'sub_123' },
        ],
        transaction: async (fn) => fn({ stripeCustomers, subscriptions }),
      },
    );

    expect(result.scanned).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.failures[0]).toMatchObject({
      stripeSubscriptionId: 'sub_123',
    });

    await expect(subscriptions.findByUserId('user_1')).resolves.toBeNull();
    await expect(stripeCustomers.findByUserId('user_1')).resolves.toBeNull();
    expect(logger.errorCalls.length).toBeGreaterThan(0);
  });
});
