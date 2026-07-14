import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import type {
  SubscriptionUpsertInput,
  SubscriptionUpsertResult,
} from '@/src/application/ports/repositories';
import { SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS } from '@/src/application/shared/persist-subscription-observation';
import {
  FakeAuthGateway,
  FakeLogger,
  FakeStripeCustomerRepository,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import type { Subscription } from '@/src/domain/entities';
import {
  type CheckoutSuccessDeps,
  syncCheckoutSuccess,
} from './checkout-success-sync';
import { runCheckoutSuccessPage } from './page';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string): never => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  useRouter: () => ({ replace: vi.fn() }),
}));

class AlwaysConflictingSubscriptionRepository extends FakeSubscriptionRepository {
  readonly inputs: SubscriptionUpsertInput[] = [];

  override async findObservationVersionByUserId(): Promise<number> {
    return this.inputs.length;
  }

  override async upsert(
    input: SubscriptionUpsertInput,
  ): Promise<SubscriptionUpsertResult> {
    this.inputs.push(input);
    return { persisted: false, reason: 'version_conflict' };
  }
}

class UserChangedConflictSubscriptionRepository extends FakeSubscriptionRepository {
  override async upsert(): Promise<SubscriptionUpsertResult> {
    throw new ApplicationError(
      'CONFLICT',
      'Subscription observation user changed during refresh',
    );
  }
}

const user = {
  id: crypto.randomUUID(),
  email: 'version-fence@example.com',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function currentSubscription(): Subscription {
  return {
    id: crypto.randomUUID(),
    userId: user.id,
    plan: 'monthly',
    status: 'active',
    currentPeriodEnd: new Date('2099-01-01T00:00:00.000Z'),
    cancelAtPeriodEnd: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function createHarness(subscriptions: FakeSubscriptionRepository): {
  deps: CheckoutSuccessDeps;
  getSubscriptionRetrieveCount: () => number;
  logger: FakeLogger;
} {
  const stripeCustomers = new FakeStripeCustomerRepository();
  const logger = new FakeLogger();
  let subscriptionRetrieveCount = 0;
  const deps: CheckoutSuccessDeps = {
    authGateway: new FakeAuthGateway(user),
    subscriptionVersions: subscriptions,
    getClerkAuth: async () => ({
      userId: 'clerk_user_1',
      redirectToSignIn: () => {
        throw new Error('Unexpected sign-in redirect');
      },
    }),
    logger,
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
        retrieve: async () => {
          subscriptionRetrieveCount += 1;
          return {
            id: 'sub_123',
            customer: 'cus_123',
            status: 'active',
            cancel_at_period_end: false,
            metadata: { user_id: user.id },
            items: {
              data: [
                {
                  current_period_end: 1_893_456_000,
                  price: { id: 'price_monthly' },
                },
              ],
            },
          };
        },
      },
    },
    priceIds: { monthly: 'price_monthly', annual: 'price_annual' },
    appUrl: 'http://localhost:3000',
    transaction: async (fn) => fn({ subscriptions, stripeCustomers }),
  };

  return {
    deps,
    getSubscriptionRetrieveCount: () => subscriptionRetrieveCount,
    logger,
  };
}

describe('syncCheckoutSuccess observation-version fence', () => {
  it('renders checkout success from the current row after bounded version conflicts', async () => {
    const subscriptions = new AlwaysConflictingSubscriptionRepository([
      {
        subscription: currentSubscription(),
        externalSubscriptionId: 'sub_123',
        version: 7,
      },
    ]);
    const { deps, getSubscriptionRetrieveCount, logger } =
      createHarness(subscriptions);

    const element = await runCheckoutSuccessPage(
      { searchParams: Promise.resolve({ session_id: 'cs_123' }) },
      deps,
      () => {
        throw new Error('Unexpected redirect');
      },
    );

    expect(renderToStaticMarkup(element)).toContain(
      'You’re all set — your subscription is active',
    );
    expect(getSubscriptionRetrieveCount()).toBe(
      SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS,
    );
    expect(subscriptions.inputs).toHaveLength(
      SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS,
    );
    expect(logger.infoCalls).toEqual([
      {
        context: {
          attempts: SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS,
          reason: 'version_conflict_attempts_exhausted',
          userId: user.id,
        },
        msg: 'Checkout success recovered entitlement from current row after CAS exhaustion',
      },
    ]);
  });

  it('propagates the user-changed-during-refresh conflict', async () => {
    const subscriptions = new UserChangedConflictSubscriptionRepository([
      {
        subscription: currentSubscription(),
        externalSubscriptionId: 'sub_123',
      },
    ]);
    const { deps } = createHarness(subscriptions);

    await expect(
      syncCheckoutSuccess({ sessionId: 'cs_123' }, deps, () => {
        throw new Error('Unexpected redirect');
      }),
    ).rejects.toMatchObject({
      name: 'ApplicationError',
      code: 'CONFLICT',
      message: 'Subscription observation user changed during refresh',
    });
  });

  it('rethrows typed exhaustion when no current subscription row exists', async () => {
    const subscriptions = new AlwaysConflictingSubscriptionRepository();
    const { deps, logger } = createHarness(subscriptions);

    await expect(
      syncCheckoutSuccess({ sessionId: 'cs_123' }, deps, () => {
        throw new Error('Unexpected redirect');
      }),
    ).rejects.toMatchObject({
      name: 'SubscriptionObservationAttemptsExhaustedError',
      code: 'CONFLICT',
      reason: 'version_conflict_attempts_exhausted',
      attempts: SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS,
    });
    expect(logger.errorCalls).toEqual([
      {
        context: {
          attempts: SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS,
          reason: 'version_conflict_attempts_exhausted',
          userId: user.id,
        },
        msg: 'Checkout success CAS exhausted with no current subscription row',
      },
    ]);
  });
});
