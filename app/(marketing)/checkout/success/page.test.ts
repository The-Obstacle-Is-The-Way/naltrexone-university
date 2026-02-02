import { describe, expect, it } from 'vitest';
import { ROUTES } from '@/lib/routes';
import { runCheckoutSuccessPage } from './page';

class RedirectError extends Error {
  constructor(readonly url: string) {
    super(`REDIRECT:${url}`);
  }
}

describe('runCheckoutSuccessPage', () => {
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
