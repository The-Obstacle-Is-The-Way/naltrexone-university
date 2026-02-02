// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type { SubscriptionRepository } from '@/src/application/ports/repositories';
import type { Subscription } from '@/src/domain/entities';
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

function createSubscription(overrides?: Partial<Subscription>): Subscription {
  return {
    id: 'sub_row_1',
    userId: 'user_1',
    plan: 'monthly',
    status: 'active',
    currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
    cancelAtPeriodEnd: false,
    createdAt: new Date('2026-02-01T00:00:00Z'),
    updatedAt: new Date('2026-02-01T00:00:00Z'),
    ...overrides,
  };
}

describe('app/(app)/app/billing/page', () => {
  describe('loadBillingData', () => {
    it('loads the subscription for the current user', async () => {
      const user = createUser();

      const authGateway: AuthGateway = {
        getCurrentUser: async () => user as never,
        requireUser: async () => user as never,
      };

      const subscriptionRepository: SubscriptionRepository = {
        findByUserId: async () => createSubscription(),
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

  describe('BillingContent', () => {
    it('renders manage button when subscription exists', async () => {
      const { BillingContent } = await import('./page');
      const subscription = createSubscription();

      const html = renderToStaticMarkup(
        <BillingContent subscription={subscription} />,
      );

      expect(html).toContain('Manage in Stripe');
      expect(html).toContain('monthly');
      expect(html).toContain('active');
    });

    it('does NOT render manage button when subscription is null', async () => {
      const { BillingContent } = await import('./page');

      const html = renderToStaticMarkup(<BillingContent subscription={null} />);

      expect(html).not.toContain('Manage in Stripe');
      expect(html).toContain('No subscription found');
    });
  });
});

describe('ManageBillingButton', () => {
  it('renders "Manage in Stripe" text', async () => {
    const { ManageBillingButton } = await import('./billing-client');

    const html = renderToStaticMarkup(<ManageBillingButton />);

    expect(html).toContain('Manage in Stripe');
  });
});
