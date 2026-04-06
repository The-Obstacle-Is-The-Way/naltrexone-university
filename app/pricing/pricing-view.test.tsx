// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PricingBanner } from '@/app/pricing/types';

let PricingView: typeof import('./pricing-view').PricingView;

beforeAll(async () => {
  PricingView = (await import('./pricing-view')).PricingView;
});

describe('app/pricing/pricing-view', () => {
  it('renders idempotency fields for manage billing forms', () => {
    const banner: PricingBanner = {
      tone: 'error',
      message: 'Subscription needs attention',
    };

    const html = renderToStaticMarkup(
      <PricingView
        isEntitled={false}
        banner={banner}
        manageBillingAction={async () => undefined}
        subscribeMonthlyAction={async () => undefined}
        subscribeAnnualAction={async () => undefined}
      />,
    );

    expect(html.match(/name="idempotencyKey"/g)).toHaveLength(2);
  });
});
