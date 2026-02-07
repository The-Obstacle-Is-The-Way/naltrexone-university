// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

const ERROR_PROPS = {
  error: Object.assign(new Error('boom'), { digest: 'digest_123' }),
  reset: () => {},
};

describe('app error heading styles', () => {
  it('uses explicit foreground heading color across all error pages', async () => {
    const AppError = (await import('@/app/error')).default;
    const GlobalError = (await import('@/app/global-error')).default;
    const PricingError = (await import('@/app/pricing/error')).default;
    const CheckoutSuccessError = (
      await import('@/app/(marketing)/checkout/success/error')
    ).default;
    const DashboardError = (await import('@/app/(app)/app/dashboard/error'))
      .default;
    const BillingError = (await import('@/app/(app)/app/billing/error'))
      .default;
    const PracticeError = (await import('@/app/(app)/app/practice/error'))
      .default;
    const BookmarksError = (await import('@/app/(app)/app/bookmarks/error'))
      .default;
    const ReviewError = (await import('@/app/(app)/app/review/error')).default;
    const QuestionError = (
      await import('@/app/(app)/app/questions/[slug]/error')
    ).default;

    const errorComponents = [
      {
        name: 'AppError',
        html: renderToStaticMarkup(<AppError {...ERROR_PROPS} />),
        headingClass: 'text-xl font-semibold text-foreground',
      },
      {
        name: 'GlobalError',
        html: renderToStaticMarkup(<GlobalError {...ERROR_PROPS} />),
        headingClass: 'text-2xl font-bold text-foreground',
      },
      {
        name: 'PricingError',
        html: renderToStaticMarkup(<PricingError {...ERROR_PROPS} />),
        headingClass: 'text-xl font-semibold text-foreground',
      },
      {
        name: 'CheckoutSuccessError',
        html: renderToStaticMarkup(<CheckoutSuccessError {...ERROR_PROPS} />),
        headingClass: 'text-xl font-semibold text-foreground',
      },
      {
        name: 'DashboardError',
        html: renderToStaticMarkup(<DashboardError {...ERROR_PROPS} />),
        headingClass: 'text-xl font-semibold text-foreground',
      },
      {
        name: 'BillingError',
        html: renderToStaticMarkup(<BillingError {...ERROR_PROPS} />),
        headingClass: 'text-xl font-semibold text-foreground',
      },
      {
        name: 'PracticeError',
        html: renderToStaticMarkup(<PracticeError {...ERROR_PROPS} />),
        headingClass: 'text-xl font-semibold text-foreground',
      },
      {
        name: 'BookmarksError',
        html: renderToStaticMarkup(<BookmarksError {...ERROR_PROPS} />),
        headingClass: 'text-xl font-semibold text-foreground',
      },
      {
        name: 'ReviewError',
        html: renderToStaticMarkup(<ReviewError {...ERROR_PROPS} />),
        headingClass: 'text-xl font-semibold text-foreground',
      },
      {
        name: 'QuestionError',
        html: renderToStaticMarkup(<QuestionError {...ERROR_PROPS} />),
        headingClass: 'text-xl font-semibold text-foreground',
      },
    ];

    for (const item of errorComponents) {
      expect(
        item.html,
        `${item.name} should contain heading class "${item.headingClass}"`,
      ).toContain(item.headingClass);
    }
  });
});
