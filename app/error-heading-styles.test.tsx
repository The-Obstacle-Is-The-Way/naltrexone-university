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

    const html = [
      renderToStaticMarkup(<AppError {...ERROR_PROPS} />),
      renderToStaticMarkup(<GlobalError {...ERROR_PROPS} />),
      renderToStaticMarkup(<PricingError {...ERROR_PROPS} />),
      renderToStaticMarkup(<CheckoutSuccessError {...ERROR_PROPS} />),
      renderToStaticMarkup(<DashboardError {...ERROR_PROPS} />),
      renderToStaticMarkup(<BillingError {...ERROR_PROPS} />),
      renderToStaticMarkup(<PracticeError {...ERROR_PROPS} />),
      renderToStaticMarkup(<BookmarksError {...ERROR_PROPS} />),
      renderToStaticMarkup(<ReviewError {...ERROR_PROPS} />),
      renderToStaticMarkup(<QuestionError {...ERROR_PROPS} />),
    ].join('\n');

    expect(html).toContain('text-2xl font-bold text-foreground');
    expect(html).toContain('text-xl font-semibold text-foreground');
  });
});
