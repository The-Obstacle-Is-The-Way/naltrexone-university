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
  findHeadingByText,
  findMainLandmarkById,
  parseHtml,
} from '@/tests/shared/dom-helpers';
import {
  type CheckoutSuccessDeps,
  type CheckoutSuccessTransaction,
  runCheckoutSuccessPage,
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
      subscriptionVersions: {
        findObservationVersionByUserId: async () => null,
      },
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
      params?: { expand?: string[] } | undefined;
    }> = [];

    const user = {
      id: fixtureUser1Id,
      email: 'user@example.com',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    };

    const stripeCustomers = new FakeStripeCustomerRepository();
    const now = new Date('2026-06-12T00:00:00.000Z');
    const subscriptions = new FakeSubscriptionRepository([], () => now);

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
    } satisfies CheckoutSuccessDeps;

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
    await expect(promise).resolves.toBeTruthy();

    expect(stripeRetrieveCalls).toEqual([
      { sessionId: 'cs_test', params: { expand: ['subscription'] } },
    ]);
  });

  it('returns the first session_id when searchParams contains an array', async () => {
    const stripeRetrieveCalls: Array<{
      sessionId: string;
      params?: { expand?: string[] } | undefined;
    }> = [];

    const user = {
      id: fixtureUser1Id,
      email: 'user@example.com',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    };

    const stripeCustomers = new FakeStripeCustomerRepository();
    const subscriptions = new FakeSubscriptionRepository();

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

    const promise = runCheckoutSuccessPage(
      {
        searchParams: Promise.resolve({
          session_id: ['cs_a', 'cs_b'],
        }) as never,
      },
      deps,
      redirectFn,
    );
    await expect(promise).resolves.toBeTruthy();

    expect(stripeRetrieveCalls).toEqual([
      { sessionId: 'cs_a', params: { expand: ['subscription'] } },
    ]);
  });

  it('renders the paid confirmation interstitial when the synced subscription is active', async () => {
    const user = {
      id: fixtureUser1Id,
      email: 'user@example.com',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    };

    const stripeCustomers = new FakeStripeCustomerRepository();
    const subscriptions = new FakeSubscriptionRepository();

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
    } satisfies CheckoutSuccessDeps;

    const redirectFn = vi.fn((_: string): never => undefined as never);

    const element = await runCheckoutSuccessPage(
      { searchParams: Promise.resolve({ session_id: 'cs_test' }) },
      deps,
      redirectFn,
    );

    const html = renderToStaticMarkup(element);
    const doc = parseHtml(html);
    const main = findMainLandmarkById(doc, 'main-content');
    const heading = findHeadingByText(
      doc,
      'You’re all set — your subscription is active',
      { level: 1 },
    );

    expect(redirectFn).not.toHaveBeenCalled();
    expect(main).not.toBeNull();
    expect(main?.getAttribute('tabindex')).toBe('-1');
    expect(heading).not.toBeNull();
    expect(html).toContain('You’re all set — your subscription is active');
    expect(html).not.toContain('free trial');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain(`href="${ROUTES.APP_DASHBOARD}"`);
    expect(html).toContain('Go to your dashboard');
  });

  it('renders trial-start copy when the synced subscription is trialing', async () => {
    const user = {
      id: fixtureUser1Id,
      email: 'user@example.com',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    };

    const stripeCustomers = new FakeStripeCustomerRepository();
    const subscriptions = new FakeSubscriptionRepository();

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
              subscription: { id: 'sub_123' },
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
    } satisfies CheckoutSuccessDeps;

    const redirectFn = vi.fn((_: string): never => undefined as never);

    const element = await runCheckoutSuccessPage(
      { searchParams: Promise.resolve({ session_id: 'cs_test' }) },
      deps,
      redirectFn,
    );

    const html = renderToStaticMarkup(element);
    expect(redirectFn).not.toHaveBeenCalled();
    expect(html).toContain(
      'Your 7-day free trial has started — no charge today',
    );
    expect(html).toContain('Your full access starts now.');
    expect(html).not.toContain('You’re all set');
    expect(html).toContain('You’ll be redirected to your dashboard shortly.');
    expect(html).toContain(`href="${ROUTES.APP_DASHBOARD}"`);
    expect(html).toContain('Go to your dashboard');
  });
});

describe('getCheckoutSuccessDeps', () => {
  it('builds deps from module loaders when deps are not provided', async () => {
    const { getCheckoutSuccessDeps } = await import('./checkout-success-sync');

    const stripeCustomers = new FakeStripeCustomerRepository();
    const subscriptions = new FakeSubscriptionRepository();
    const user = {
      id: fixtureUser1Id,
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
        getStripe: () => ({
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
        }),
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
