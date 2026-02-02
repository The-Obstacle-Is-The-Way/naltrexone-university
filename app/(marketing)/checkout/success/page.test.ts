import { describe, expect, it, vi } from 'vitest';
import { ROUTES } from '@/lib/routes';
import { runCheckoutSuccessPage } from './page';

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
      stripe: {
        checkout: {
          sessions: {
            retrieve: stripeRetrieve,
          },
        },
        subscriptions: {
          retrieve: async () => ({}),
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
          retrieve: async () => ({}),
        },
      },
      priceIds: { monthly: 'price_monthly', annual: 'price_annual' },
      appUrl: 'https://example.com',
      transaction: async (fn: any) =>
        fn({
          stripeCustomers: { insert: async () => undefined },
          subscriptions: { upsert: async () => undefined },
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
