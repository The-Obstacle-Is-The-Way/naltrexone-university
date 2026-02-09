// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ROUTES } from '@/lib/routes';
import {
  FakeAuthGateway,
  FakeLogger,
  FakeStripeCustomerRepository,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import {
  type CheckoutSuccessDeps,
  type CheckoutSuccessTransaction,
  runCheckoutSuccessPage,
  syncCheckoutSuccess,
} from './page';

class RedirectError extends Error {
  constructor(readonly url: string) {
    super(`REDIRECT:${url}`);
  }
}

describe('runCheckoutSuccessPage', () => {
  it('redirects unauthenticated users to sign-in (preserves session_id)', async () => {
    const authGateway = new FakeAuthGateway(null);
    const requireUser = vi.spyOn(authGateway, 'requireUser');

    const stripeRetrieve = vi.fn(async () => {
      throw new Error('should not be called');
    });

    const redirectToSignIn = vi.fn(
      ({ returnBackUrl }: { returnBackUrl: string | URL }): never => {
        expect(returnBackUrl.toString()).toBe(
          'https://example.com/checkout/success?session_id=cs_test',
        );
        throw new RedirectError('REDIRECT:SIGN_IN');
      },
    );

    const deps = {
      authGateway,
      getClerkAuth: async () => ({
        userId: null,
        redirectToSignIn,
      }),
      logger: new FakeLogger(),
      stripe: {
        checkout: {
          sessions: {
            retrieve: stripeRetrieve,
          },
        },
        subscriptions: {
          retrieve: async () => ({
            id: 'sub_123',
            customer: 'cus_123',
            status: 'active',
            cancel_at_period_end: false,
            metadata: { user_id: 'user_1' },
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
      transaction: async () => undefined,
    };

    const redirectFn = (url: string): never => {
      throw new RedirectError(url);
    };

    const promise = runCheckoutSuccessPage(
      { searchParams: Promise.resolve({ session_id: 'cs_test' }) },
      deps as never,
      redirectFn,
    );

    await expect(promise).rejects.toMatchObject({ url: 'REDIRECT:SIGN_IN' });
    expect(redirectToSignIn).toHaveBeenCalledWith({
      returnBackUrl: expect.any(URL),
    });
    expect(stripeRetrieve).not.toHaveBeenCalled();
    expect(requireUser).not.toHaveBeenCalled();
  });

  it('awaits searchParams before reading session_id', async () => {
    const stripeRetrieveCalls: Array<{
      sessionId: string;
      params?: { expand?: string[] };
    }> = [];

    const user = {
      id: 'user_1',
      email: 'user@example.com',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    };

    const stripeCustomers = new FakeStripeCustomerRepository();
    const subscriptions = new FakeSubscriptionRepository();

    const deps = {
      authGateway: new FakeAuthGateway(user),
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
            retrieve: async (
              sessionId: string,
              params?: { expand?: string[] },
            ) => {
              stripeRetrieveCalls.push({ sessionId, params });
              return {
                customer: 'cus_123',
                subscription: { id: 'sub_123' },
              };
            },
          },
        },
        subscriptions: {
          retrieve: async () => ({
            id: 'sub_123',
            customer: 'cus_123',
            status: 'active',
            cancel_at_period_end: false,
            metadata: { user_id: 'user_1' },
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

    const searchParams = new Proxy(Promise.resolve({ session_id: 'cs_test' }), {
      get(target, propertyKey) {
        if (propertyKey === 'then') return target.then.bind(target);
        if (propertyKey === 'catch') return target.catch.bind(target);
        if (propertyKey === 'finally') return target.finally.bind(target);
        if (propertyKey === Symbol.toStringTag)
          return target[Symbol.toStringTag];

        throw new Error('searchParams must be awaited before property access');
      },
    });

    const redirectFn = (url: string): never => {
      throw new RedirectError(url);
    };

    const promise = runCheckoutSuccessPage({ searchParams }, deps, redirectFn);
    await expect(promise).rejects.toMatchObject({ url: ROUTES.APP_DASHBOARD });

    expect(stripeRetrieveCalls).toEqual([
      { sessionId: 'cs_test', params: { expand: ['subscription'] } },
    ]);
  });

  it('renders a semantic fallback shell with main landmark when redirect is intercepted', async () => {
    const user = {
      id: 'user_1',
      email: 'user@example.com',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    };

    const stripeCustomers = new FakeStripeCustomerRepository();
    const subscriptions = new FakeSubscriptionRepository();

    const deps = {
      authGateway: new FakeAuthGateway(user),
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
              subscription: { id: 'sub_123' },
            }),
          },
        },
        subscriptions: {
          retrieve: async () => ({
            id: 'sub_123',
            customer: 'cus_123',
            status: 'active',
            cancel_at_period_end: false,
            metadata: { user_id: 'user_1' },
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
    } satisfies CheckoutSuccessDeps;

    const redirectFn = vi.fn((_: string): never => undefined as never);

    const element = await runCheckoutSuccessPage(
      { searchParams: Promise.resolve({ session_id: 'cs_test' }) },
      deps,
      redirectFn,
    );

    const html = renderToStaticMarkup(element);
    expect(redirectFn).toHaveBeenCalledWith(ROUTES.APP_DASHBOARD);
    expect(html).toContain('<main id="main-content"');
    expect(html).toContain('Finalizing your subscription…');
  });
});

describe('getCheckoutSuccessDeps', () => {
  it('builds deps from module loaders when deps are not provided', async () => {
    const { getCheckoutSuccessDeps } = await import('./checkout-success-sync');

    const stripeCustomers = new FakeStripeCustomerRepository();
    const subscriptions = new FakeSubscriptionRepository();
    const user = {
      id: 'user_1',
      email: 'user@example.com',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    };

    const fakeContainer = {
      createAuthGateway: () => new FakeAuthGateway(user),
      logger: new FakeLogger(),
      env: {
        NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: 'price_monthly',
        NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: 'price_annual',
        NEXT_PUBLIC_APP_URL: 'https://example.com',
      },
      db: {
        transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
          fn({ tx: true }),
      },
      createStripeCustomerRepository: () => stripeCustomers,
      createSubscriptionRepository: () => subscriptions,
    };

    const deps = await getCheckoutSuccessDeps(undefined, {
      loadContainer: async () => ({
        createContainer: () => fakeContainer,
      }),
      loadStripe: async () => ({
        stripe: {
          checkout: {
            sessions: {
              retrieve: async () => ({
                customer: 'cus_1',
                subscription: 'sub_1',
              }),
            },
          },
          subscriptions: {
            retrieve: async () => ({
              id: 'sub_1',
            }),
          },
        },
      }),
      loadClerkServer: async () => ({
        auth: async () => ({
          userId: 'clerk_user_1',
          redirectToSignIn: () => {
            throw new Error('should not redirect');
          },
        }),
      }),
    });

    expect(deps.priceIds).toEqual({
      monthly: 'price_monthly',
      annual: 'price_annual',
    });
    expect(deps.appUrl).toBe('https://example.com');
    expect(typeof deps.transaction).toBe('function');

    const result = await deps.transaction(async (tx) => {
      expect(tx.stripeCustomers).toBe(stripeCustomers);
      expect(tx.subscriptions).toBe(subscriptions);
      return 'ok';
    });

    expect(result).toBe('ok');
  });
});

describe('syncCheckoutSuccess retry logging', () => {
  it('logs warn entries when Stripe calls are retried', async () => {
    vi.useFakeTimers();

    try {
      const stripeCustomers = new FakeStripeCustomerRepository();
      const subscriptions = new FakeSubscriptionRepository();
      const user = {
        id: 'user_1',
        email: 'user@example.com',
        createdAt: new Date('2026-02-01T00:00:00Z'),
        updatedAt: new Date('2026-02-01T00:00:00Z'),
      };

      const logger = new FakeLogger();
      let sessionCalls = 0;
      let subscriptionCalls = 0;

      const deps = {
        authGateway: new FakeAuthGateway(user),
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
                metadata: { user_id: 'user_1' },
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
      ).then(
        () => {
          throw new Error('Expected syncCheckoutSuccess to redirect');
        },
        (error) => error,
      );

      await vi.runAllTimersAsync();

      const error = await promise;
      expect(error).toMatchObject({ url: ROUTES.APP_DASHBOARD });
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
        id: 'user_1',
        email: 'user@example.com',
        createdAt: new Date('2026-02-01T00:00:00Z'),
        updatedAt: new Date('2026-02-01T00:00:00Z'),
      };

      const error = vi.fn();
      let sessionCalls = 0;

      const deps = {
        authGateway: new FakeAuthGateway(user),
        getClerkAuth: async () => ({
          userId: 'clerk_user_1',
          redirectToSignIn: () => {
            throw new Error('should not redirect to sign-in');
          },
        }),
        logger: { error },
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
              metadata: { user_id: 'user_1' },
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
      ).then(
        () => {
          throw new Error('Expected syncCheckoutSuccess to redirect');
        },
        (thrown) => thrown,
      );

      await vi.runAllTimersAsync();

      const thrown = await promise;
      expect(thrown).toMatchObject({ url: ROUTES.APP_DASHBOARD });
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
  const CHECKOUT_ERROR_ROUTE = `${ROUTES.PRICING}?checkout=error`;

  it.each([
    {
      reason: 'missing_session_id',
      input: { sessionId: null },
      session: null,
      subscription: null,
    },
    {
      reason: 'missing_stripe_ids',
      input: { sessionId: 'cs_test' },
      session: { customer: null, subscription: null },
      subscription: null,
    },
    {
      reason: 'missing_user_id',
      input: { sessionId: 'cs_test' },
      session: { customer: 'cus_123', subscription: 'sub_123' },
      subscription: { metadata: {} },
    },
    {
      reason: 'missing_user_id',
      input: { sessionId: 'cs_test' },
      session: { customer: 'cus_123', subscription: 'sub_123' },
      subscription: { metadata: { user_id: '' } },
    },
    {
      reason: 'user_id_mismatch',
      input: { sessionId: 'cs_test' },
      session: { customer: 'cus_123', subscription: 'sub_123' },
      subscription: { metadata: { user_id: 'user_2' } },
    },
    {
      reason: 'invalid_subscription_status',
      input: { sessionId: 'cs_test' },
      session: { customer: 'cus_123', subscription: 'sub_123' },
      subscription: { status: 'not_a_status' },
    },
    {
      reason: 'missing_current_period_end',
      input: { sessionId: 'cs_test' },
      session: { customer: 'cus_123', subscription: 'sub_123' },
      subscription: { items: { data: [{ price: { id: 'price_monthly' } }] } },
    },
    {
      reason: 'missing_cancel_at_period_end',
      input: { sessionId: 'cs_test' },
      session: { customer: 'cus_123', subscription: 'sub_123' },
      subscription: { cancel_at_period_end: undefined },
    },
    {
      reason: 'missing_price_id',
      input: { sessionId: 'cs_test' },
      session: { customer: 'cus_123', subscription: 'sub_123' },
      subscription: {
        items: { data: [{ current_period_end: 2_000_000_000 }] },
      },
    },
    {
      reason: 'unknown_plan',
      input: { sessionId: 'cs_test' },
      session: { customer: 'cus_123', subscription: 'sub_123' },
      subscription: {
        items: {
          data: [
            {
              current_period_end: 2_000_000_000,
              price: { id: 'price_unknown' },
            },
          ],
        },
      },
    },
  ])('logs %s before redirecting to pricing error', async ({
    reason,
    input,
    session,
    subscription,
  }) => {
    const logger = new FakeLogger();
    const authGateway = new FakeAuthGateway({
      id: 'user_1',
      email: 'user@example.com',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    });

    const deps = {
      authGateway,
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
              if (!session) throw new Error('should not fetch Stripe session');
              return session;
            },
          },
        },
        subscriptions: {
          retrieve: async () => {
            if (!subscription)
              throw new Error('should not fetch Stripe subscription');
            return {
              id: 'sub_123',
              customer: 'cus_123',
              status: 'active',
              cancel_at_period_end: false,
              metadata: { user_id: 'user_1' },
              items: {
                data: [
                  {
                    current_period_end: 2_000_000_000,
                    price: { id: 'price_monthly' },
                  },
                ],
              },
              ...subscription,
            };
          },
        },
      },
      priceIds: { monthly: 'price_monthly', annual: 'price_annual' },
      appUrl: 'https://example.com',
      transaction: async () => {
        throw new Error('should not start a transaction');
      },
    };

    const redirectFn = (url: string): never => {
      throw new RedirectError(url);
    };

    await expect(
      syncCheckoutSuccess(input, deps as never, redirectFn),
    ).rejects.toMatchObject({
      url: CHECKOUT_ERROR_ROUTE,
    });

    expect(logger.errorCalls).toHaveLength(1);
    expect(logger.errorCalls[0]).toMatchObject({
      msg: 'Checkout success validation failed',
      context: expect.objectContaining({ reason }),
    });
  });

  it('returns redirect to pricing with reason=payment_processing when subscription is not entitled', async () => {
    const stripeCustomers = new FakeStripeCustomerRepository();
    const subscriptions = new FakeSubscriptionRepository();
    const user = {
      id: 'user_1',
      email: 'user@example.com',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    };

    const deps = {
      authGateway: new FakeAuthGateway(user),
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
            status: 'incomplete',
            cancel_at_period_end: false,
            metadata: { user_id: 'user_1' },
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

    await expect(
      syncCheckoutSuccess({ sessionId: 'cs_test' }, deps as never, redirectFn),
    ).rejects.toMatchObject({
      url: `${ROUTES.PRICING}?reason=payment_processing`,
    });

    expect(await stripeCustomers.findByUserId('user_1')).toEqual({
      stripeCustomerId: 'cus_123',
    });
    expect(
      await subscriptions.findByExternalSubscriptionId('sub_123'),
    ).toMatchObject({
      userId: 'user_1',
      status: 'paymentProcessing',
      plan: 'monthly',
      cancelAtPeriodEnd: false,
    });
  });

  it('returns redirect to dashboard when subscription is pastDue with active period (dunning grace)', async () => {
    const stripeCustomers = new FakeStripeCustomerRepository();
    const subscriptions = new FakeSubscriptionRepository();
    const user = {
      id: 'user_1',
      email: 'user@example.com',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    };

    const deps = {
      authGateway: new FakeAuthGateway(user),
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
            metadata: { user_id: 'user_1' },
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

    await expect(
      syncCheckoutSuccess({ sessionId: 'cs_test' }, deps as never, redirectFn),
    ).rejects.toMatchObject({
      url: ROUTES.APP_DASHBOARD,
    });

    expect(await stripeCustomers.findByUserId('user_1')).toEqual({
      stripeCustomerId: 'cus_123',
    });
    expect(
      await subscriptions.findByExternalSubscriptionId('sub_123'),
    ).toMatchObject({
      userId: 'user_1',
      status: 'pastDue',
      plan: 'monthly',
      cancelAtPeriodEnd: false,
    });
  });

  it('treats existing webhook customer mapping as idempotent and still redirects to dashboard', async () => {
    const stripeCustomers = new FakeStripeCustomerRepository();
    const subscriptions = new FakeSubscriptionRepository();
    const user = {
      id: 'user_1',
      email: 'user@example.com',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    };

    // Simulates webhook processing first with an older customer mapping.
    await stripeCustomers.insert(user.id, 'cus_webhook');

    const deps = {
      authGateway: new FakeAuthGateway(user),
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
            metadata: { user_id: 'user_1' },
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

    await expect(
      syncCheckoutSuccess({ sessionId: 'cs_test' }, deps as never, redirectFn),
    ).rejects.toMatchObject({ url: ROUTES.APP_DASHBOARD });

    expect(await stripeCustomers.findByUserId(user.id)).toEqual({
      stripeCustomerId: 'cus_checkout',
    });
  });
});
