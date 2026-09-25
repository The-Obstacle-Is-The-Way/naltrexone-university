// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  FakeAuthGateway,
  FakeLogger,
  FakeStripeCustomerRepository,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import {
  type CheckoutSuccessDeps,
  type CheckoutSuccessTransaction,
  syncCheckoutSuccess,
} from './page';

const fixtureUser1Id = crypto.randomUUID();

// The page embeds the client redirect component, whose useRouter() call needs
// an app-router context that static rendering does not provide.
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string): never => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  useRouter: () => ({ replace: vi.fn() }),
}));

class RedirectError extends Error {
  constructor(readonly url: string) {
    super(`REDIRECT:${url}`);
  }
}

describe('syncCheckoutSuccess retry logging', () => {
  it('logs warn entries when Stripe calls are retried', async () => {
    vi.useFakeTimers();

    try {
      const stripeCustomers = new FakeStripeCustomerRepository();
      const subscriptions = new FakeSubscriptionRepository();
      const user = {
        id: fixtureUser1Id,
        email: 'user@example.com',
        createdAt: new Date('2026-02-01T00:00:00Z'),
        updatedAt: new Date('2026-02-01T00:00:00Z'),
      };

      const logger = new FakeLogger();
      let sessionCalls = 0;
      let subscriptionCalls = 0;

      const deps = {
        authGateway: new FakeAuthGateway(user),
        subscriptionVersions: subscriptions,
        getClerkAuth: async () => ({
          userId: 'clerk_user_1',
          redirectToSignIn: () => {
            throw new Error('should not redirect to sign-in');
          },
        }),
        logger,
        stripe: {
          checkout: {
            sessions: {
              retrieve: async () => {
                sessionCalls += 1;
                if (sessionCalls === 1) {
                  throw { code: 'ECONNRESET' };
                }
                return { customer: 'cus_123', subscription: 'sub_123' };
              },
            },
          },
          subscriptions: {
            retrieve: async () => {
              subscriptionCalls += 1;
              if (subscriptionCalls === 1) {
                throw { statusCode: 502 };
              }
              return {
                id: 'sub_123',
                customer: 'cus_123',
                status: 'active',
                cancel_at_period_end: false,
                metadata: { user_id: fixtureUser1Id },
                items: {
                  data: [
                    {
                      current_period_end: 2_000_000_000,
                      price: { id: 'price_monthly' },
                    },
                  ],
                },
              };
            },
          },
        },
        priceIds: { monthly: 'price_monthly', annual: 'price_annual' },
        appUrl: 'https://example.com',
        transaction: async <T>(
          fn: (tx: CheckoutSuccessTransaction) => Promise<T>,
        ): Promise<T> =>
          fn({
            stripeCustomers,
            subscriptions,
          }),
      };

      const redirectFn = (url: string): never => {
        throw new RedirectError(url);
      };

      const promise = syncCheckoutSuccess(
        { sessionId: 'cs_test' },
        deps as never,
        redirectFn,
      );

      await vi.runAllTimersAsync();

      await expect(promise).resolves.toEqual({ status: 'active' });
      expect(logger.warnCalls.length).toBeGreaterThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('logs retry entries via error when warn is undefined', async () => {
    vi.useFakeTimers();

    try {
      const stripeCustomers = new FakeStripeCustomerRepository();
      const subscriptions = new FakeSubscriptionRepository();
      const user = {
        id: fixtureUser1Id,
        email: 'user@example.com',
        createdAt: new Date('2026-02-01T00:00:00Z'),
        updatedAt: new Date('2026-02-01T00:00:00Z'),
      };

      const error = vi.fn();
      const info = vi.fn();
      let sessionCalls = 0;

      const deps = {
        authGateway: new FakeAuthGateway(user),
        subscriptionVersions: subscriptions,
        getClerkAuth: async () => ({
          userId: 'clerk_user_1',
          redirectToSignIn: () => {
            throw new Error('should not redirect to sign-in');
          },
        }),
        logger: { info, error },
        stripe: {
          checkout: {
            sessions: {
              retrieve: async () => {
                sessionCalls += 1;
                if (sessionCalls === 1) {
                  throw { code: 'ECONNRESET' };
                }
                return { customer: 'cus_123', subscription: 'sub_123' };
              },
            },
          },
          subscriptions: {
            retrieve: async () => ({
              id: 'sub_123',
              customer: 'cus_123',
              status: 'active',
              cancel_at_period_end: false,
              metadata: { user_id: fixtureUser1Id },
              items: {
                data: [
                  {
                    current_period_end: 2_000_000_000,
                    price: { id: 'price_monthly' },
                  },
                ],
              },
            }),
          },
        },
        priceIds: { monthly: 'price_monthly', annual: 'price_annual' },
        appUrl: 'https://example.com',
        transaction: async <T>(
          fn: (tx: CheckoutSuccessTransaction) => Promise<T>,
        ): Promise<T> =>
          fn({
            stripeCustomers,
            subscriptions,
          }),
      };

      const redirectFn = (url: string): never => {
        throw new RedirectError(url);
      };

      const promise = syncCheckoutSuccess(
        { sessionId: 'cs_test' },
        deps as never,
        redirectFn,
      );

      await vi.runAllTimersAsync();

      await expect(promise).resolves.toEqual({ status: 'active' });
      expect(error).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'cs_test',
          attempt: 1,
          maxAttempts: expect.any(Number),
          delayMs: expect.any(Number),
          error: expect.any(String),
        }),
        'Retrying Stripe API call',
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('syncCheckoutSuccess', () => {
  it('does not let a stale success URL downgrade a newer active subscription', async () => {
    const stripeCustomers = new FakeStripeCustomerRepository();
    const now = new Date('2026-06-12T00:00:00.000Z');
    const protectedPeriodEnd = new Date('2099-01-01T00:00:00.000Z');
    const subscriptions = new FakeSubscriptionRepository([], () => now);
    const user = {
      id: fixtureUser1Id,
      email: 'user@example.com',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    };
    await subscriptions.upsert({
      userId: user.id,
      externalSubscriptionId: 'sub_current',
      expectedVersion: null,
      plan: 'annual',
      status: 'active',
      currentPeriodEnd: protectedPeriodEnd,
      cancelAtPeriodEnd: false,
    });

    const deps = {
      authGateway: new FakeAuthGateway(user),
      subscriptionVersions: subscriptions,
      getClerkAuth: async () => ({
        userId: 'clerk_user_1',
        redirectToSignIn: () => {
          throw new Error('should not redirect to sign-in');
        },
      }),
      logger: new FakeLogger(),
      stripe: {
        checkout: {
          sessions: {
            retrieve: async () => ({
              customer: 'cus_123',
              subscription: 'sub_superseded',
            }),
          },
        },
        subscriptions: {
          retrieve: async () => ({
            id: 'sub_superseded',
            customer: 'cus_123',
            status: 'canceled',
            cancel_at_period_end: false,
            metadata: { user_id: fixtureUser1Id },
            items: {
              data: [
                {
                  current_period_end: 1_000_000_000,
                  price: { id: 'price_monthly' },
                },
              ],
            },
          }),
        },
      },
      priceIds: { monthly: 'price_monthly', annual: 'price_annual' },
      appUrl: 'https://example.com',
      transaction: async <T>(
        fn: (tx: CheckoutSuccessTransaction) => Promise<T>,
      ): Promise<T> =>
        fn({
          stripeCustomers,
          subscriptions,
        }),
    };

    const redirectFn = vi.fn((url: string): never => {
      throw new RedirectError(url);
    });

    await expect(
      syncCheckoutSuccess({ sessionId: 'cs_old' }, deps as never, redirectFn),
    ).resolves.toEqual({ status: 'active' });

    expect(redirectFn).not.toHaveBeenCalled();
    await expect(
      subscriptions.findByExternalSubscriptionId('sub_current'),
    ).resolves.toMatchObject({
      userId: user.id,
      status: 'active',
      plan: 'annual',
      currentPeriodEnd: protectedPeriodEnd,
    });
    await expect(
      subscriptions.findByExternalSubscriptionId('sub_superseded'),
    ).resolves.toBeNull();
  });

  it('does not let a duplicate non-entitled success URL overwrite a current active subscription', async () => {
    const stripeCustomers = new FakeStripeCustomerRepository();
    const now = new Date('2026-06-12T00:00:00.000Z');
    const protectedPeriodEnd = new Date('2099-01-01T00:00:00.000Z');
    const subscriptions = new FakeSubscriptionRepository([], () => now);
    const user = {
      id: fixtureUser1Id,
      email: 'user@example.com',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    };
    await subscriptions.upsert({
      userId: user.id,
      externalSubscriptionId: 'sub_current',
      expectedVersion: null,
      plan: 'annual',
      status: 'active',
      currentPeriodEnd: protectedPeriodEnd,
      cancelAtPeriodEnd: false,
    });

    const deps = {
      authGateway: new FakeAuthGateway(user),
      subscriptionVersions: subscriptions,
      getClerkAuth: async () => ({
        userId: 'clerk_user_1',
        redirectToSignIn: () => {
          throw new Error('should not redirect to sign-in');
        },
      }),
      logger: new FakeLogger(),
      stripe: {
        checkout: {
          sessions: {
            retrieve: async () => ({
              customer: 'cus_123',
              subscription: 'sub_unpaid',
            }),
          },
        },
        subscriptions: {
          retrieve: async () => ({
            id: 'sub_unpaid',
            customer: 'cus_123',
            status: 'unpaid',
            cancel_at_period_end: false,
            metadata: { user_id: fixtureUser1Id },
            items: {
              data: [
                {
                  current_period_end: 4_000_000_000,
                  price: { id: 'price_monthly' },
                },
              ],
            },
          }),
        },
      },
      priceIds: { monthly: 'price_monthly', annual: 'price_annual' },
      appUrl: 'https://example.com',
      transaction: async <T>(
        fn: (tx: CheckoutSuccessTransaction) => Promise<T>,
      ): Promise<T> =>
        fn({
          stripeCustomers,
          subscriptions,
        }),
    } satisfies CheckoutSuccessDeps;

    const redirectFn = vi.fn((url: string): never => {
      throw new RedirectError(url);
    });

    await expect(
      syncCheckoutSuccess({ sessionId: 'cs_unpaid' }, deps, redirectFn),
    ).resolves.toEqual({ status: 'active' });

    expect(redirectFn).not.toHaveBeenCalled();
    await expect(
      subscriptions.findByExternalSubscriptionId('sub_current'),
    ).resolves.toMatchObject({
      userId: user.id,
      status: 'active',
      plan: 'annual',
      currentPeriodEnd: protectedPeriodEnd,
    });
    await expect(
      subscriptions.findByExternalSubscriptionId('sub_unpaid'),
    ).resolves.toBeNull();
  });

  it('resolves with pastDue when the period is active (dunning grace) without redirecting', async () => {
    const stripeCustomers = new FakeStripeCustomerRepository();
    const subscriptions = new FakeSubscriptionRepository();
    const user = {
      id: fixtureUser1Id,
      email: 'user@example.com',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    };

    const deps = {
      authGateway: new FakeAuthGateway(user),
      subscriptionVersions: subscriptions,
      getClerkAuth: async () => ({
        userId: 'clerk_user_1',
        redirectToSignIn: () => {
          throw new Error('should not redirect to sign-in');
        },
      }),
      logger: new FakeLogger(),
      stripe: {
        checkout: {
          sessions: {
            retrieve: async () => ({
              customer: 'cus_123',
              subscription: 'sub_123',
            }),
          },
        },
        subscriptions: {
          retrieve: async () => ({
            id: 'sub_123',
            customer: 'cus_123',
            status: 'past_due',
            cancel_at_period_end: false,
            metadata: { user_id: fixtureUser1Id },
            items: {
              data: [
                {
                  current_period_end: 2_000_000_000,
                  price: { id: 'price_monthly' },
                },
              ],
            },
          }),
        },
      },
      priceIds: { monthly: 'price_monthly', annual: 'price_annual' },
      appUrl: 'https://example.com',
      transaction: async <T>(
        fn: (tx: CheckoutSuccessTransaction) => Promise<T>,
      ): Promise<T> =>
        fn({
          stripeCustomers,
          subscriptions,
        }),
    };

    const redirectFn = vi.fn((url: string): never => {
      throw new RedirectError(url);
    });

    await expect(
      syncCheckoutSuccess({ sessionId: 'cs_test' }, deps as never, redirectFn),
    ).resolves.toEqual({ status: 'pastDue' });

    expect(redirectFn).not.toHaveBeenCalled();
    expect(await stripeCustomers.findByUserId(fixtureUser1Id)).toEqual({
      stripeCustomerId: 'cus_123',
    });
    expect(
      await subscriptions.findByExternalSubscriptionId('sub_123'),
    ).toMatchObject({
      userId: fixtureUser1Id,
      status: 'pastDue',
      plan: 'monthly',
      cancelAtPeriodEnd: false,
    });
  });

  it('resolves with the synced subscription status for an entitled user without redirecting', async () => {
    const stripeCustomers = new FakeStripeCustomerRepository();
    const subscriptions = new FakeSubscriptionRepository();
    const user = {
      id: fixtureUser1Id,
      email: 'user@example.com',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    };

    const deps = {
      authGateway: new FakeAuthGateway(user),
      subscriptionVersions: subscriptions,
      getClerkAuth: async () => ({
        userId: 'clerk_user_1',
        redirectToSignIn: () => {
          throw new Error('should not redirect to sign-in');
        },
      }),
      logger: new FakeLogger(),
      stripe: {
        checkout: {
          sessions: {
            retrieve: async () => ({
              customer: 'cus_123',
              subscription: 'sub_123',
            }),
          },
        },
        subscriptions: {
          retrieve: async () => ({
            id: 'sub_123',
            customer: 'cus_123',
            status: 'trialing',
            cancel_at_period_end: false,
            metadata: { user_id: fixtureUser1Id },
            items: {
              data: [
                {
                  current_period_end: 2_000_000_000,
                  price: { id: 'price_monthly' },
                },
              ],
            },
          }),
        },
      },
      priceIds: { monthly: 'price_monthly', annual: 'price_annual' },
      appUrl: 'https://example.com',
      transaction: async <T>(
        fn: (tx: CheckoutSuccessTransaction) => Promise<T>,
      ): Promise<T> =>
        fn({
          stripeCustomers,
          subscriptions,
        }),
    };

    const redirectFn = vi.fn((url: string): never => {
      throw new RedirectError(url);
    });

    await expect(
      syncCheckoutSuccess({ sessionId: 'cs_test' }, deps as never, redirectFn),
    ).resolves.toEqual({ status: 'inTrial' });

    expect(redirectFn).not.toHaveBeenCalled();
    expect(
      await subscriptions.findByExternalSubscriptionId('sub_123'),
    ).toMatchObject({
      userId: fixtureUser1Id,
      status: 'inTrial',
      plan: 'monthly',
    });
  });

  it('treats existing webhook customer mapping as idempotent and resolves to the entitled state', async () => {
    const stripeCustomers = new FakeStripeCustomerRepository();
    const subscriptions = new FakeSubscriptionRepository();
    const user = {
      id: fixtureUser1Id,
      email: 'user@example.com',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    };

    // Simulates webhook processing first with an older customer mapping.
    await stripeCustomers.insert(user.id, 'cus_webhook');

    const deps = {
      authGateway: new FakeAuthGateway(user),
      subscriptionVersions: subscriptions,
      getClerkAuth: async () => ({
        userId: 'clerk_user_1',
        redirectToSignIn: () => {
          throw new Error('should not redirect to sign-in');
        },
      }),
      logger: new FakeLogger(),
      stripe: {
        checkout: {
          sessions: {
            retrieve: async () => ({
              customer: 'cus_checkout',
              subscription: 'sub_123',
            }),
          },
        },
        subscriptions: {
          retrieve: async () => ({
            id: 'sub_123',
            customer: 'cus_checkout',
            status: 'active',
            cancel_at_period_end: false,
            metadata: { user_id: fixtureUser1Id },
            items: {
              data: [
                {
                  current_period_end: 2_000_000_000,
                  price: { id: 'price_monthly' },
                },
              ],
            },
          }),
        },
      },
      priceIds: { monthly: 'price_monthly', annual: 'price_annual' },
      appUrl: 'https://example.com',
      transaction: async <T>(
        fn: (tx: CheckoutSuccessTransaction) => Promise<T>,
      ): Promise<T> =>
        fn({
          stripeCustomers,
          subscriptions,
        }),
    };

    const redirectFn = vi.fn((url: string): never => {
      throw new RedirectError(url);
    });

    await expect(
      syncCheckoutSuccess({ sessionId: 'cs_test' }, deps as never, redirectFn),
    ).resolves.toEqual({ status: 'active' });

    expect(redirectFn).not.toHaveBeenCalled();
    expect(await stripeCustomers.findByUserId(user.id)).toEqual({
      stripeCustomerId: 'cus_checkout',
    });
  });
});
