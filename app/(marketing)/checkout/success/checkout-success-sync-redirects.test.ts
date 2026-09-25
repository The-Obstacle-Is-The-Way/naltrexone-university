// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { ROUTES } from '@/lib/routes';
import {
  FakeAuthGateway,
  FakeLogger,
  FakeStripeCustomerRepository,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import { type CheckoutSuccessTransaction, syncCheckoutSuccess } from './page';

const fixtureUser1Id = crypto.randomUUID();
const fixtureUser2Id = crypto.randomUUID();

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
      subscription: { metadata: { user_id: fixtureUser2Id } },
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
  ])(
    'logs %s before redirecting to pricing error',
    async ({ reason, input, session, subscription }) => {
      const logger = new FakeLogger();
      const authGateway = new FakeAuthGateway({
        id: fixtureUser1Id,
        email: 'user@example.com',
        createdAt: new Date('2026-02-01T00:00:00Z'),
        updatedAt: new Date('2026-02-01T00:00:00Z'),
      });

      const deps = {
        authGateway,
        subscriptionVersions: {
          findObservationVersionByUserId: async () => null,
        },
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
                if (!session)
                  throw new Error('should not fetch Stripe session');
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
                metadata: { user_id: fixtureUser1Id },
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
      expect(logger.infoCalls).toHaveLength(1);
      expect(logger.infoCalls[0]).toMatchObject({
        msg: 'Checkout success redirected to checkout error',
        context: expect.objectContaining({
          reason,
          route: ROUTES.CHECKOUT_SUCCESS,
        }),
      });

      expect(logger.warnCalls).toHaveLength(0);
    },
  );

  it('returns redirect to pricing with reason=payment_processing when subscription is not entitled', async () => {
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
            status: 'incomplete',
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

    await expect(
      syncCheckoutSuccess({ sessionId: 'cs_test' }, deps as never, redirectFn),
    ).rejects.toMatchObject({
      url: `${ROUTES.PRICING}?reason=payment_processing`,
    });

    expect(await stripeCustomers.findByUserId(fixtureUser1Id)).toEqual({
      stripeCustomerId: 'cus_123',
    });
    expect(
      await subscriptions.findByExternalSubscriptionId('sub_123'),
    ).toMatchObject({
      userId: fixtureUser1Id,
      status: 'paymentProcessing',
      plan: 'monthly',
      cancelAtPeriodEnd: false,
    });
  });

  it('returns redirect to pricing with reason=subscription_required when subscription status is incomplete_expired', async () => {
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
            status: 'incomplete_expired',
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

    await expect(
      syncCheckoutSuccess({ sessionId: 'cs_test' }, deps as never, redirectFn),
    ).rejects.toMatchObject({
      url: `${ROUTES.PRICING}?reason=subscription_required`,
    });

    expect(await stripeCustomers.findByUserId(fixtureUser1Id)).toEqual({
      stripeCustomerId: 'cus_123',
    });
    expect(
      await subscriptions.findByExternalSubscriptionId('sub_123'),
    ).toMatchObject({
      userId: fixtureUser1Id,
      status: 'paymentFailed',
      plan: 'monthly',
      cancelAtPeriodEnd: false,
    });
  });

  it('returns redirect to pricing with reason=subscription_required when current period has ended', async () => {
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

    const redirectFn = (url: string): never => {
      throw new RedirectError(url);
    };

    await expect(
      syncCheckoutSuccess({ sessionId: 'cs_test' }, deps as never, redirectFn),
    ).rejects.toMatchObject({
      url: `${ROUTES.PRICING}?reason=subscription_required`,
    });
  });
});
