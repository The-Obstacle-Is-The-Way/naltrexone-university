import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type {
  StripeCustomerRepository,
  SubscriptionRepository,
} from '@/src/application/ports/repositories';
import { type CheckoutSuccessDeps, syncCheckoutSuccess } from './page';

type UserLike = {
  id: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
};

function createUser(): UserLike {
  return {
    id: 'user_1',
    email: 'user@example.com',
    createdAt: new Date('2026-02-01T00:00:00Z'),
    updatedAt: new Date('2026-02-01T00:00:00Z'),
  };
}

describe('app/(marketing)/checkout/success/page', () => {
  it('redirects to /pricing when sessionId is missing', async () => {
    const redirectFn = vi.fn((url: string) => {
      throw new Error(`redirect:${url}`);
    });

    await expect(
      syncCheckoutSuccess({ sessionId: null }, undefined, redirectFn as never),
    ).rejects.toMatchObject({ message: 'redirect:/pricing' });
  });

  it('syncs subscription and redirects to /app/dashboard on success', async () => {
    const user = createUser();

    const authGateway: AuthGateway = {
      getCurrentUser: async () => user as never,
      requireUser: async () => user as never,
    };

    const stripeCustomers: StripeCustomerRepository = {
      findByUserId: vi.fn(async () => null),
      insert: vi.fn(async () => undefined),
    };

    const subscriptions: SubscriptionRepository = {
      findByUserId: vi.fn(async () => null),
      findByStripeSubscriptionId: vi.fn(async () => null),
      upsert: vi.fn(async () => undefined),
    };

    const stripe: CheckoutSuccessDeps['stripe'] = {
      checkout: {
        sessions: {
          retrieve: vi.fn(async () => ({
            customer: 'cus_123',
            subscription: {
              id: 'sub_123',
              customer: 'cus_123',
              status: 'active',
              current_period_end: 1_700_000_000,
              cancel_at_period_end: false,
              metadata: { user_id: 'user_1' },
              items: { data: [{ price: { id: 'price_m' } }] },
            },
          })),
        },
      },
      subscriptions: {
        retrieve: vi.fn(async () => ({})),
      },
    };

    const redirectFn = vi.fn((url: string) => {
      throw new Error(`redirect:${url}`);
    });

    const deps = {
      authGateway,
      stripe,
      priceIds: { monthly: 'price_m', annual: 'price_a' },
      transaction: async <T>(
        fn: (tx: {
          stripeCustomers: StripeCustomerRepository;
          subscriptions: SubscriptionRepository;
        }) => Promise<T>,
      ): Promise<T> => fn({ stripeCustomers, subscriptions }),
    };

    await expect(
      syncCheckoutSuccess(
        { sessionId: 'cs_test_123' },
        deps,
        redirectFn as never,
      ),
    ).rejects.toMatchObject({ message: 'redirect:/app/dashboard' });

    expect(stripe.checkout.sessions.retrieve).toHaveBeenCalledWith(
      'cs_test_123',
      {
        expand: ['subscription'],
      },
    );

    expect(stripeCustomers.insert).toHaveBeenCalledWith('user_1', 'cus_123');
    expect(subscriptions.upsert).toHaveBeenCalledWith({
      userId: 'user_1',
      stripeSubscriptionId: 'sub_123',
      plan: 'monthly',
      status: 'active',
      currentPeriodEnd: new Date(1_700_000_000 * 1000),
      cancelAtPeriodEnd: false,
    });
  });

  it('redirects to /pricing when checkout session does not belong to the current user', async () => {
    const user = createUser();

    const authGateway: AuthGateway = {
      getCurrentUser: async () => user as never,
      requireUser: async () => user as never,
    };

    const stripe: CheckoutSuccessDeps['stripe'] = {
      checkout: {
        sessions: {
          retrieve: vi.fn(async () => ({
            customer: 'cus_123',
            subscription: {
              id: 'sub_123',
              customer: 'cus_123',
              status: 'active',
              current_period_end: 1_700_000_000,
              cancel_at_period_end: false,
              metadata: { user_id: 'user_other' },
              items: { data: [{ price: { id: 'price_m' } }] },
            },
          })),
        },
      },
      subscriptions: {
        retrieve: vi.fn(async () => ({})),
      },
    };

    const redirectFn = vi.fn((url: string) => {
      throw new Error(`redirect:${url}`);
    });

    const deps = {
      authGateway,
      stripe,
      priceIds: { monthly: 'price_m', annual: 'price_a' },
      transaction: async () => {
        throw new ApplicationError('INTERNAL_ERROR', 'unexpected transaction');
      },
    };

    await expect(
      syncCheckoutSuccess(
        { sessionId: 'cs_test_123' },
        deps,
        redirectFn as never,
      ),
    ).rejects.toMatchObject({ message: 'redirect:/pricing' });
  });
});
