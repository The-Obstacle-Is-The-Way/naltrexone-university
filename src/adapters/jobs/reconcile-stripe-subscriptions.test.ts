import { describe, expect, it, vi } from 'vitest';
import {
  FakeLogger,
  FakeStripeCustomerRepository,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import { loadJsonFixture } from '@/tests/shared/load-json-fixture';
import { reconcileStripeSubscriptions } from './reconcile-stripe-subscriptions';

describe('reconcileStripeSubscriptions', () => {
  it('upserts subscriptions and customer mappings for local subscriptions', async () => {
    const subscriptionEvent = loadJsonFixture<{
      data: { object: unknown };
    }>('stripe/customer.subscription.updated.json');

    const stripe = {
      subscriptions: {
        retrieve: vi.fn(async () => subscriptionEvent.data.object),
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

  it('reports a failure when Stripe subscription metadata user id mismatches', async () => {
    const subscriptionEvent = loadJsonFixture<{
      data: { object: unknown };
    }>('stripe/customer.subscription.updated.json');
    const subscription = subscriptionEvent.data.object as {
      metadata?: Record<string, string>;
    };

    const stripe = {
      subscriptions: {
        retrieve: vi.fn(async () => ({
          ...subscription,
          metadata: { ...(subscription.metadata ?? {}), user_id: 'user_other' },
        })),
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
