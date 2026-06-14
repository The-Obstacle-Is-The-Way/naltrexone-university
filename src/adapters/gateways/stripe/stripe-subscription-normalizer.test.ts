import { describe, expect, it, vi } from 'vitest';
import type { StripePriceIds } from '@/src/adapters/config/stripe-prices';
import { STRIPE_SUBSCRIPTION_METADATA_E2E_OWNER_FIELD } from '@/src/adapters/shared/stripe-subscription-errors';
import type { StripeClient } from '@/src/adapters/shared/stripe-types';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import {
  normalizeStripeSubscriptionUpdate,
  retrieveAndNormalizeStripeSubscription,
} from './stripe-subscription-normalizer';

const priceIds: StripePriceIds = {
  monthly: 'price_monthly',
  annual: 'price_annual',
};

const appUserId = crypto.randomUUID();

function createSubscriptionFixture(overrides?: {
  status?: string;
  userId?: string | null;
  e2eOwner?: string;
  priceId?: string;
}) {
  const metadata: Record<string, string> | undefined =
    overrides?.userId === null
      ? undefined
      : {
          user_id: overrides?.userId ?? appUserId,
          ...(overrides?.e2eOwner ? { e2e_owner: overrides.e2eOwner } : {}),
        };

  return {
    id: 'sub_123',
    customer: 'cus_123',
    status: overrides?.status ?? 'active',
    cancel_at_period_end: false,
    metadata,
    items: {
      data: [
        {
          current_period_end: 1_800_000_000,
          price: { id: overrides?.priceId ?? priceIds.monthly },
        },
      ],
    },
  };
}

describe('normalizeStripeSubscriptionUpdate', () => {
  it('maps Stripe subscription payload into webhook subscriptionUpdate', () => {
    const logger = new FakeLogger();
    const subscription = createSubscriptionFixture();

    const result = normalizeStripeSubscriptionUpdate({
      subscription,
      eventId: 'evt_1',
      type: 'customer.subscription.updated',
      priceIds,
      logger,
    });

    expect(result).toEqual({
      userId: appUserId,
      externalCustomerId: 'cus_123',
      externalSubscriptionId: 'sub_123',
      plan: 'monthly',
      status: 'active',
      currentPeriodEnd: new Date(1_800_000_000 * 1000),
      cancelAtPeriodEnd: false,
    });
  });

  it('throws STRIPE_ERROR when metadata.user_id is missing', () => {
    const logger = new FakeLogger();

    expect(() =>
      normalizeStripeSubscriptionUpdate({
        subscription: createSubscriptionFixture({ userId: null }),
        eventId: 'evt_1',
        type: 'customer.subscription.updated',
        priceIds,
        logger,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'STRIPE_ERROR',
        fieldErrors: {
          'metadata.user_id': ['required'],
        },
      }),
    );

    expect(logger.errorCalls).toHaveLength(1);
    expect(logger.errorCalls[0]).toMatchObject({
      msg: 'Stripe subscription metadata.user_id is required',
      context: {
        eventId: 'evt_1',
        type: 'customer.subscription.updated',
        stripeSubscriptionId: 'sub_123',
        stripeCustomerId: 'cus_123',
      },
    });
  });

  it('throws STRIPE_ERROR when subscription e2e_owner differs from configured webhook owner', () => {
    const logger = new FakeLogger();

    expect(() =>
      normalizeStripeSubscriptionUpdate({
        subscription: createSubscriptionFixture({ e2eOwner: 'github-ci' }),
        eventId: 'evt_1',
        type: 'customer.subscription.updated',
        priceIds,
        logger,
        webhookE2EOwner: 'vercel-dev-preview',
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'STRIPE_ERROR',
        fieldErrors: {
          [STRIPE_SUBSCRIPTION_METADATA_E2E_OWNER_FIELD]: ['mismatch'],
        },
      }),
    );
  });

  it('does not throw for e2e_owner metadata when webhook owner is unset', () => {
    const logger = new FakeLogger();

    expect(() =>
      normalizeStripeSubscriptionUpdate({
        subscription: createSubscriptionFixture({ e2eOwner: 'github-ci' }),
        eventId: 'evt_1',
        type: 'customer.subscription.updated',
        priceIds,
        logger,
      }),
    ).not.toThrow();
  });

  it('does not throw when webhook owner matches event e2e_owner metadata', () => {
    const logger = new FakeLogger();

    const result = normalizeStripeSubscriptionUpdate({
      subscription: createSubscriptionFixture({
        e2eOwner: 'vercel-dev-preview',
      }),
      eventId: 'evt_1',
      type: 'customer.subscription.updated',
      priceIds,
      logger,
      webhookE2EOwner: 'vercel-dev-preview',
    });

    expect(result.userId).toBe(appUserId);
  });

  it('does not throw when webhook owner is configured but event has no e2e_owner metadata', () => {
    const logger = new FakeLogger();

    expect(() =>
      normalizeStripeSubscriptionUpdate({
        subscription: createSubscriptionFixture(),
        eventId: 'evt_1',
        type: 'customer.subscription.updated',
        priceIds,
        logger,
        webhookE2EOwner: 'vercel-dev-preview',
      }),
    ).not.toThrow();
  });

  it('throws STRIPE_ERROR when subscription status is invalid', () => {
    const logger = new FakeLogger();

    expect(() =>
      normalizeStripeSubscriptionUpdate({
        subscription: createSubscriptionFixture({ status: 'unknown_status' }),
        eventId: 'evt_1',
        type: 'customer.subscription.updated',
        priceIds,
        logger,
      }),
    ).toThrow(expect.objectContaining({ code: 'STRIPE_ERROR' }));
  });

  it('throws STRIPE_ERROR when price id does not match configured plans', () => {
    const logger = new FakeLogger();

    expect(() =>
      normalizeStripeSubscriptionUpdate({
        subscription: createSubscriptionFixture({ priceId: 'price_other' }),
        eventId: 'evt_1',
        type: 'customer.subscription.updated',
        priceIds,
        logger,
      }),
    ).toThrow(expect.objectContaining({ code: 'STRIPE_ERROR' }));
  });
});

describe('retrieveAndNormalizeStripeSubscription', () => {
  it('throws STRIPE_ERROR when Stripe subscriptions client is unavailable', async () => {
    const logger = new FakeLogger();
    const stripe = {
      subscriptions: undefined,
    } as unknown as StripeClient;

    await expect(
      retrieveAndNormalizeStripeSubscription({
        stripe,
        subscriptionRef: 'sub_123',
        event: { id: 'evt_1', type: 'invoice.payment_succeeded' },
        priceIds,
        logger,
      }),
    ).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
    });
  });

  it('throws INVALID_WEBHOOK_PAYLOAD when retrieved subscription is invalid', async () => {
    const logger = new FakeLogger();
    const stripe = {
      subscriptions: {
        retrieve: vi.fn(async () => ({
          id: 'sub_123',
          customer: 'cus_123',
          status: 'active',
          cancel_at_period_end: false,
          metadata: { user_id: appUserId },
          items: { data: [] },
        })),
      },
    } as unknown as StripeClient;

    await expect(
      retrieveAndNormalizeStripeSubscription({
        stripe,
        subscriptionRef: 'sub_123',
        event: { id: 'evt_1', type: 'invoice.payment_succeeded' },
        priceIds,
        logger,
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_WEBHOOK_PAYLOAD',
    });

    expect(logger.errorCalls).toHaveLength(1);
    const errorCall = logger.errorCalls[0];
    if (errorCall === undefined) {
      throw new Error('Expected Stripe subscription payload error log');
    }
    expect(errorCall.msg).toContain(
      'Invalid Stripe subscription payload retrieved',
    );
  });

  it('retrieves and normalizes a subscription reference object', async () => {
    const logger = new FakeLogger();
    const retrieve = vi.fn(async () => createSubscriptionFixture());
    const stripe = {
      subscriptions: { retrieve },
    } as unknown as StripeClient;

    const result = await retrieveAndNormalizeStripeSubscription({
      stripe,
      subscriptionRef: { id: 'sub_123' },
      event: { id: 'evt_1', type: 'customer.subscription.updated' },
      priceIds,
      logger,
    });

    expect(result).toMatchObject({
      userId: appUserId,
      externalCustomerId: 'cus_123',
      externalSubscriptionId: 'sub_123',
      plan: 'monthly',
      status: 'active',
      cancelAtPeriodEnd: false,
    });
    expect(retrieve).toHaveBeenCalledWith('sub_123');
  });
});
