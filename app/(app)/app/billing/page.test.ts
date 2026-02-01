import { describe, expect, it } from 'vitest';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type { SubscriptionRepository } from '@/src/application/ports/repositories';
import { loadBillingData } from './page';

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

describe('app/(app)/app/billing/page', () => {
  it('loads the subscription for the current user', async () => {
    const user = createUser();

    const authGateway: AuthGateway = {
      getCurrentUser: async () => user as never,
      requireUser: async () => user as never,
    };

    const subscriptionRepository: SubscriptionRepository = {
      findByUserId: async () => ({
        id: 'sub_row_1',
        userId: user.id,
        plan: 'monthly',
        status: 'active',
        currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
        createdAt: new Date('2026-02-01T00:00:00Z'),
        updatedAt: new Date('2026-02-01T00:00:00Z'),
      }),
      findByStripeSubscriptionId: async () => null,
      upsert: async () => undefined,
    };

    await expect(
      loadBillingData({ authGateway, subscriptionRepository }),
    ).resolves.toMatchObject({
      userId: user.id,
      subscription: { status: 'active', plan: 'monthly' },
    });
  });
});
