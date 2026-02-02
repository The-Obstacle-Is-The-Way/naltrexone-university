import { describe, expect, it, vi } from 'vitest';
import { ROUTES } from '@/lib/routes';
import {
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
    const requireUser = vi.fn(async () => {
      throw new Error('should not be called');
    });

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
      authGateway: {
        getCurrentUser: async () => null,
        requireUser,
      },
      getClerkAuth: async () => ({
        userId: null,
        redirectToSignIn,
      }),
      logger: { error: vi.fn() },
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
            current_period_end: 1_706_000_000,
            cancel_at_period_end: false,
            metadata: { user_id: 'user_1' },
            items: { data: [{ price: { id: 'price_monthly' } }] },
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

    const deps = {
      authGateway: {
        getCurrentUser: async () => null,
        requireUser: async () => ({
          id: 'user_1',
          email: 'user@example.com',
          createdAt: new Date('2026-02-01T00:00:00Z'),
          updatedAt: new Date('2026-02-01T00:00:00Z'),
        }),
      },
      getClerkAuth: async () => ({
        userId: 'clerk_user_1',
        redirectToSignIn: () => {
          throw new Error('should not redirect to sign-in');
        },
      }),
      logger: { error: vi.fn() },
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
                subscription: {
                  id: 'sub_123',
                  customer: 'cus_123',
                  status: 'active',
                  current_period_end: 1_706_000_000,
                  cancel_at_period_end: false,
                  metadata: { user_id: 'user_1' },
                  items: { data: [{ price: { id: 'price_monthly' } }] },
                },
              };
            },
          },
        },
        subscriptions: {
          retrieve: async () => ({
            id: 'sub_123',
            customer: 'cus_123',
            status: 'active',
            current_period_end: 1_706_000_000,
            cancel_at_period_end: false,
            metadata: { user_id: 'user_1' },
            items: { data: [{ price: { id: 'price_monthly' } }] },
          }),
        },
      },
      priceIds: { monthly: 'price_monthly', annual: 'price_annual' },
      appUrl: 'https://example.com',
      transaction: async <T>(
        fn: (tx: CheckoutSuccessTransaction) => Promise<T>,
      ): Promise<T> =>
        fn({
          stripeCustomers: {
            findByUserId: async () => null,
            insert: async () => undefined,
          },
          subscriptions: {
            findByUserId: async () => null,
            findByStripeSubscriptionId: async () => null,
            upsert: async () => undefined,
          },
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
      subscription: { current_period_end: undefined },
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
      subscription: { items: { data: [] } },
    },
    {
      reason: 'unknown_plan',
      input: { sessionId: 'cs_test' },
      session: { customer: 'cus_123', subscription: 'sub_123' },
      subscription: { items: { data: [{ price: { id: 'price_unknown' } }] } },
    },
  ])('logs %s before redirecting to pricing error', async ({
    reason,
    input,
    session,
    subscription,
  }) => {
    const loggerError = vi.fn();

    const deps = {
      authGateway: {
        getCurrentUser: async () => null,
        requireUser: async () => ({
          id: 'user_1',
          email: 'user@example.com',
          createdAt: new Date('2026-02-01T00:00:00Z'),
          updatedAt: new Date('2026-02-01T00:00:00Z'),
        }),
      },
      getClerkAuth: async () => ({
        userId: 'clerk_user_1',
        redirectToSignIn: () => {
          throw new Error('should not redirect to sign-in');
        },
      }),
      logger: { error: loggerError },
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
              current_period_end: 1_706_000_000,
              cancel_at_period_end: false,
              metadata: { user_id: 'user_1' },
              items: { data: [{ price: { id: 'price_monthly' } }] },
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

    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ reason }),
      'Checkout success validation failed',
    );
  });
});
