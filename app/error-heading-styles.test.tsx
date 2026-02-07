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
  it('renders semantic headings across all error pages', async () => {
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
        headingTag: 'h2',
        headingText: 'Something went wrong',
      },
      {
        name: 'GlobalError',
        html: renderToStaticMarkup(<GlobalError {...ERROR_PROPS} />),
        headingTag: 'h1',
        headingText: 'Something went wrong',
      },
      {
        name: 'PricingError',
        html: renderToStaticMarkup(<PricingError {...ERROR_PROPS} />),
        headingTag: 'h2',
        headingText: 'Pricing error',
      },
      {
        name: 'CheckoutSuccessError',
        html: renderToStaticMarkup(<CheckoutSuccessError {...ERROR_PROPS} />),
        headingTag: 'h2',
        headingText: 'Checkout error',
      },
      {
        name: 'DashboardError',
        html: renderToStaticMarkup(<DashboardError {...ERROR_PROPS} />),
        headingTag: 'h2',
        headingText: 'Dashboard error',
      },
      {
        name: 'BillingError',
        html: renderToStaticMarkup(<BillingError {...ERROR_PROPS} />),
        headingTag: 'h2',
        headingText: 'Billing error',
      },
      {
        name: 'PracticeError',
        html: renderToStaticMarkup(<PracticeError {...ERROR_PROPS} />),
        headingTag: 'h2',
        headingText: 'Practice error',
      },
      {
        name: 'BookmarksError',
        html: renderToStaticMarkup(<BookmarksError {...ERROR_PROPS} />),
        headingTag: 'h2',
        headingText: 'Bookmarks error',
      },
      {
        name: 'ReviewError',
        html: renderToStaticMarkup(<ReviewError {...ERROR_PROPS} />),
        headingTag: 'h2',
        headingText: 'Review error',
      },
      {
        name: 'QuestionError',
        html: renderToStaticMarkup(<QuestionError {...ERROR_PROPS} />),
        headingTag: 'h2',
        headingText: 'Question error',
      },
    ];

    for (const item of errorComponents) {
      const doc = new DOMParser().parseFromString(item.html, 'text/html');
      const heading = doc.querySelector(item.headingTag);
      expect(
        heading,
        `${item.name} should render ${item.headingTag}`,
      ).not.toBeNull();

      expect(
        heading?.textContent?.trim(),
        `${item.name} should render ${item.headingTag} with the expected heading text`,
      ).toBe(item.headingText);
      expect(item.html).toContain('Error ID: digest_123');
      expect(item.html).toContain('Try again');
    }
  });
});
