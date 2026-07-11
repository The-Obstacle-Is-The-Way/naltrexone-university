import { describe, expect, it } from 'vitest';
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
import {
  type CheckoutSuccessDeps,
  syncCheckoutSuccess,
} from './checkout-success-sync';

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

describe('syncCheckoutSuccess observation-version fence', () => {
  it('preserves the thrown error path after bounded version conflicts', async () => {
    const user = {
      id: crypto.randomUUID(),
      email: 'version-fence@example.com',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const subscriptions = new AlwaysConflictingSubscriptionRepository();
    const stripeCustomers = new FakeStripeCustomerRepository();
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

    await expect(
      syncCheckoutSuccess({ sessionId: 'cs_123' }, deps, () => {
        throw new Error('Unexpected redirect');
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: `Subscription observation version conflicted after ${SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS} attempts`,
    });

    expect(subscriptionRetrieveCount).toBe(
      SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS,
    );
    expect(subscriptions.inputs).toHaveLength(
      SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS,
    );
  });
});
