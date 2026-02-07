// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadBillingData } from '@/app/(app)/app/billing/page';
import {
  FakeAuthGateway,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import { createSubscription, createUser } from '@/src/domain/test-helpers';

describe('app/(app)/app/billing/page', () => {
  describe('loadBillingData', () => {
    it('loads the subscription for the current user', async () => {
      const user = createUser({ id: 'user_1' });

      const authGateway = new FakeAuthGateway(user);
      const subscriptionRepository = new FakeSubscriptionRepository([
        createSubscription({ userId: user.id }),
      ]);

      await expect(
        loadBillingData({ authGateway, subscriptionRepository }),
      ).resolves.toMatchObject({
        userId: user.id,
        subscription: { status: 'active', plan: 'monthly' },
      });
    });
  });

  describe('BillingPage', () => {
    it('renders the no-subscription view when subscription is null', async () => {
      const BillingPage = (await import('@/app/(app)/app/billing/page'))
        .default;
      const user = createUser({ id: 'user_1' });

      const authGateway = new FakeAuthGateway(user);
      const subscriptionRepository = new FakeSubscriptionRepository();

      const element = await BillingPage({
        deps: { authGateway, subscriptionRepository },
      });
      const html = renderToStaticMarkup(element);

      expect(html).toContain('No subscription found');
      expect(html).not.toContain('Manage in Stripe');
    });

    it('renders an error banner when redirected back with portal_failed', async () => {
      const BillingPage = (await import('@/app/(app)/app/billing/page'))
        .default;
      const user = createUser({ id: 'user_1' });

      const authGateway = new FakeAuthGateway(user);
      const subscriptionRepository = new FakeSubscriptionRepository([
        createSubscription({ userId: user.id }),
      ]);

      const element = await BillingPage({
        deps: { authGateway, subscriptionRepository },
        searchParams: Promise.resolve({ error: 'portal_failed' }),
      });
      const html = renderToStaticMarkup(element);

      expect(html).toContain('open the billing portal. Please try again.');
      expect(html).toContain('Manage in Stripe');
    });

    it('supports array-valued errors in async searchParams', async () => {
      const BillingPage = (await import('@/app/(app)/app/billing/page'))
        .default;
      const user = createUser({ id: 'user_1' });

      const authGateway = new FakeAuthGateway(user);
      const subscriptionRepository = new FakeSubscriptionRepository([
        createSubscription({ userId: user.id }),
      ]);

      const element = await BillingPage({
        deps: { authGateway, subscriptionRepository },
        searchParams: Promise.resolve({ error: ['portal_failed'] }),
      });
      const html = renderToStaticMarkup(element);

      expect(html).toContain('open the billing portal. Please try again.');
      expect(html).toContain('Manage in Stripe');
    });
  });

  describe('BillingContent', () => {
    it('renders manage button when subscription exists', async () => {
      const { BillingContent } = await import('@/app/(app)/app/billing/page');
      const subscription = createSubscription();

      const html = renderToStaticMarkup(
        <BillingContent
          subscription={subscription}
          manageBillingAction={async () => undefined}
        />,
      );

      expect(html).toContain('Manage in Stripe');
      expect(html).toContain('monthly');
      expect(html).toContain('active');
    });

    it('renders cancelAtPeriodEnd banner when cancellation is scheduled', async () => {
      const { BillingContent } = await import('@/app/(app)/app/billing/page');
      const subscription = createSubscription({
        cancelAtPeriodEnd: true,
        currentPeriodEnd: new Date('2026-02-15T00:00:00Z'),
      });

      const cancelDate = new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }).format(subscription.currentPeriodEnd);

      const html = renderToStaticMarkup(
        <BillingContent
          subscription={subscription}
          manageBillingAction={async () => undefined}
        />,
      );

      expect(html).toContain('will cancel');
      expect(html).toContain(cancelDate);
    });

    it('does NOT render manage button when subscription is null', async () => {
      const { BillingContent } = await import('@/app/(app)/app/billing/page');

      const html = renderToStaticMarkup(<BillingContent subscription={null} />);

      expect(html).not.toContain('Manage in Stripe');
      expect(html).toContain('No subscription found');
    });
  });

  describe('BillingPageView', () => {
    it('renders BillingContent with manage action when subscription exists', async () => {
      const { BillingPageView } = await import('@/app/(app)/app/billing/page');
      const subscription = createSubscription();

      const html = renderToStaticMarkup(
        <BillingPageView
          subscription={subscription}
          manageBillingAction={async () => undefined}
        />,
      );

      expect(html).toContain('Billing');
      expect(html).toContain('Manage your subscription');
      expect(html).toContain('Manage in Stripe');
      expect(html).toContain(
        'text-2xl font-bold font-heading tracking-tight text-foreground',
      );
    });

    it('renders BillingContent without manage action when no subscription exists', async () => {
      const { BillingPageView } = await import('@/app/(app)/app/billing/page');

      const html = renderToStaticMarkup(
        <BillingPageView subscription={null} />,
      );

      expect(html).toContain('Billing');
      expect(html).toContain('No subscription found');
    });
  });
});
