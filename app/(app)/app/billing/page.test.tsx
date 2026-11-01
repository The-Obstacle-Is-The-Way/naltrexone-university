// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadBillingData } from '@/app/(app)/app/billing/page';
import type { SubscriptionRepository } from '@/src/application/ports/repositories';
import {
  FakeAuthGateway,
  FakeSubscriptionRepository,
  FakeTrialPaymentMethodSetupOperationRepository,
} from '@/src/application/test-helpers/fakes';
import { CheckTrialSavedCardUseCase } from '@/src/application/use-cases';
import { createSubscription, createUser } from '@/src/domain/test-helpers';
import { findHeadingByText, parseHtml } from '@/tests/shared/dom-helpers';

const { fixtureUser1Id } = vi.hoisted(() => ({
  fixtureUser1Id: crypto.randomUUID(),
}));

function createTrackedThenable<T>(value: T) {
  const thenSpy = vi.fn();
  const thenFn = <TResult1 = T, TResult2 = never>(
    onFulfilled?:
      | ((value: T) => TResult1 | PromiseLike<TResult1>)
      | null
      | undefined,
    onRejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null
      | undefined,
  ) => {
    thenSpy();
    return Promise.resolve(value).then(onFulfilled, onRejected);
  };

  const proxy = new Proxy(
    {},
    {
      get(target, prop, receiver) {
        if (prop === 'then') {
          return thenFn;
        }

        return Reflect.get(target, prop, receiver);
      },
    },
  );

  return {
    thenable: proxy as PromiseLike<T>,
    thenSpy,
  };
}

// BUG-308: the saved-card check over the maintained fakes, with no card.
function checkTrialSavedCard(subscriptionRepository: SubscriptionRepository) {
  return new CheckTrialSavedCardUseCase(
    subscriptionRepository,
    new FakeTrialPaymentMethodSetupOperationRepository(),
  );
}

describe('app/(app)/app/billing/page', () => {
  describe('loadBillingData', () => {
    it('loads the subscription for the current user', async () => {
      const user = createUser({ id: fixtureUser1Id });

      const authGateway = new FakeAuthGateway(user);
      const subscriptionRepository = new FakeSubscriptionRepository([
        createSubscription({ userId: user.id }),
      ]);

      await expect(
        loadBillingData({
          authGateway,
          subscriptionRepository,
          checkTrialSavedCardUseCase: checkTrialSavedCard(
            subscriptionRepository,
          ),
        }),
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
      const user = createUser({ id: fixtureUser1Id });

      const authGateway = new FakeAuthGateway(user);
      const subscriptionRepository = new FakeSubscriptionRepository();

      const element = await BillingPage({
        deps: {
          authGateway,
          subscriptionRepository,
          checkTrialSavedCardUseCase: checkTrialSavedCard(
            subscriptionRepository,
          ),
        },
      });
      const html = renderToStaticMarkup(element);

      expect(html).toContain('No subscription found');
      expect(html).not.toContain('Manage in Stripe');
    });

    it('renders an error banner when redirected back with portal_failed', async () => {
      const BillingPage = (await import('@/app/(app)/app/billing/page'))
        .default;
      const user = createUser({ id: fixtureUser1Id });

      const authGateway = new FakeAuthGateway(user);
      const subscriptionRepository = new FakeSubscriptionRepository([
        createSubscription({ userId: user.id }),
      ]);

      const element = await BillingPage({
        deps: {
          authGateway,
          subscriptionRepository,
          checkTrialSavedCardUseCase: checkTrialSavedCard(
            subscriptionRepository,
          ),
        },
        searchParams: Promise.resolve({ error: 'portal_failed' }),
      });
      const html = renderToStaticMarkup(element);

      expect(html).toContain('open the billing portal. Please try again.');
      expect(html).toContain('Manage in Stripe');
    });

    // DEBT-414 F03b: the add-card action returns here when it cannot open
    // Stripe, including when the terms changed after they were displayed.
    it('renders the add-card error when redirected back with trial_payment_method_failed', async () => {
      const BillingPage = (await import('@/app/(app)/app/billing/page'))
        .default;
      const user = createUser({ id: fixtureUser1Id });

      const authGateway = new FakeAuthGateway(user);
      const subscriptionRepository = new FakeSubscriptionRepository([
        createSubscription({ userId: user.id, status: 'inTrial' }),
      ]);

      const element = await BillingPage({
        deps: {
          authGateway,
          subscriptionRepository,
          checkTrialSavedCardUseCase: checkTrialSavedCard(
            subscriptionRepository,
          ),
        },
        searchParams: Promise.resolve({
          error: 'trial_payment_method_failed',
        }),
      });
      const html = renderToStaticMarkup(element);

      // #1183 review: a stale-terms refusal never reaches Stripe, so the
      // message names no cause.
      const alert = parseHtml(html).querySelector('[role="alert"]');
      expect(alert?.textContent).toBe(
        "We couldn't start adding your card. Review the current terms from the trial banner and try again.",
      );
      expect(html).not.toContain('open the billing portal');
    });

    it('starts searchParams before billing data resolves', async () => {
      const BillingPage = (await import('@/app/(app)/app/billing/page'))
        .default;
      const user = createUser({ id: fixtureUser1Id });
      let releaseUser: (() => void) | undefined;

      const authGateway = new FakeAuthGateway(user);
      const requireUserSpy = vi
        .spyOn(authGateway, 'requireUser')
        .mockImplementation(
          () =>
            new Promise((resolve) => {
              releaseUser = () => resolve(user);
            }),
        );
      const subscriptionRepository = new FakeSubscriptionRepository([
        createSubscription({ userId: user.id }),
      ]);
      const { thenable: searchParams, thenSpy } = createTrackedThenable({
        error: 'portal_failed',
      });

      const pagePromise = BillingPage({
        deps: {
          authGateway,
          subscriptionRepository,
          checkTrialSavedCardUseCase: checkTrialSavedCard(
            subscriptionRepository,
          ),
        },
        searchParams: searchParams as unknown as Promise<{
          error?: string | string[];
        }>,
      });

      await Promise.resolve();

      expect(requireUserSpy).toHaveBeenCalledTimes(1);
      expect(thenSpy).toHaveBeenCalledTimes(1);

      releaseUser?.();

      const element = await pagePromise;
      const html = renderToStaticMarkup(element);

      expect(html).toContain('open the billing portal. Please try again.');
      expect(html).toContain('Manage in Stripe');
    });

    it('supports array-valued errors in async searchParams', async () => {
      const BillingPage = (await import('@/app/(app)/app/billing/page'))
        .default;
      const user = createUser({ id: fixtureUser1Id });

      const authGateway = new FakeAuthGateway(user);
      const subscriptionRepository = new FakeSubscriptionRepository([
        createSubscription({ userId: user.id }),
      ]);

      const element = await BillingPage({
        deps: {
          authGateway,
          subscriptionRepository,
          checkTrialSavedCardUseCase: checkTrialSavedCard(
            subscriptionRepository,
          ),
        },
        searchParams: Promise.resolve({ error: ['portal_failed'] }),
      });
      const html = renderToStaticMarkup(element);

      expect(html).toContain('open the billing portal. Please try again.');
      expect(html).toContain('Manage in Stripe');
    });
  });

  describe('BillingContent', () => {
    let BillingContent: typeof import('./page').BillingContent;
    beforeAll(async () => {
      BillingContent = (await import('./page')).BillingContent;
    });
    it('renders manage button when subscription exists', async () => {
      const subscription = createSubscription();

      const html = renderToStaticMarkup(
        <BillingContent
          subscription={subscription}
          manageBillingAction={async () => undefined}
        />,
      );

      expect(html).toContain('Manage in Stripe');
      expect(html).toContain('Pro Monthly · Active');
    });

    it.each([
      {
        name: 'previous US evening',
        cutoff: '2026-11-01T03:00:00Z',
        expected:
          'November 1, 2026 at 3:00 AM UTC (October 31 at 11:00 PM EDT, October 31 at 8:00 PM PDT)',
      },
      {
        name: 'first fall-back hour',
        cutoff: '2026-11-01T05:30:00Z',
        expected:
          'November 1, 2026 at 5:30 AM UTC (1:30 AM EDT, October 31 at 10:30 PM PDT)',
      },
      {
        name: 'second fall-back hour',
        cutoff: '2026-11-01T06:30:00Z',
        expected:
          'November 1, 2026 at 6:30 AM UTC (1:30 AM EST, October 31 at 11:30 PM PDT)',
      },
      {
        name: 'before spring-forward',
        cutoff: '2026-03-08T06:30:00Z',
        expected:
          'March 8, 2026 at 6:30 AM UTC (1:30 AM EST, March 7 at 10:30 PM PST)',
      },
      {
        name: 'after spring-forward',
        cutoff: '2026-03-08T07:30:00Z',
        expected:
          'March 8, 2026 at 7:30 AM UTC (3:30 AM EDT, March 7 at 11:30 PM PST)',
      },
      {
        name: 'previous US year',
        cutoff: '2027-01-01T03:00:00Z',
        expected:
          'January 1, 2027 at 3:00 AM UTC (December 31, 2026 at 10:00 PM EST, December 31, 2026 at 7:00 PM PST)',
      },
    ])(
      'states the $name cancellation cutoff with UTC, Eastern and Pacific times',
      {
        meta: {
          ruleProof: {
            file: 'app/(app)/app/billing/page.test.tsx',
            title:
              'states the $name cancellation cutoff with UTC, Eastern and Pacific times',
          },
        },
      },
      ({ cutoff, expected }) => {
        const subscription = createSubscription({
          cancelAtPeriodEnd: true,
          currentPeriodEnd: new Date(cutoff),
        });
        const html = renderToStaticMarkup(
          <BillingContent
            subscription={subscription}
            manageBillingAction={async () => undefined}
          />,
        );
        const rendered = parseHtml(html).body.textContent;
        expect(rendered).toContain(
          `Your subscription will cancel on ${expected}. You'll keep access until then.`,
        );
      },
    );

    it('does NOT render manage button when subscription is null', async () => {
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
      const doc = parseHtml(html);
      const heading = findHeadingByText(doc, 'Billing', { level: 1 });

      expect(html).toContain('Billing');
      expect(html).toContain('Manage your subscription');
      expect(html).toContain('Manage in Stripe');
      expect(heading).not.toBeNull();
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
