// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PricingBanner } from '@/app/pricing/types';

let PricingView: typeof import('./pricing-view').PricingView;

beforeAll(async () => {
  PricingView = (await import('./pricing-view')).PricingView;
});

describe('app/pricing/pricing-view', () => {
  it('renders plan grid when user is not entitled and manageBillingAction is undefined', () => {
    const banner: PricingBanner = {
      tone: 'info',
      message:
        'Your subscription is inactive. Choose a plan to restart access.',
    };

    const html = renderToStaticMarkup(
      <PricingView
        isEntitled={false}
        banner={banner}
        subscribeMonthlyAction={async () => undefined}
        subscribeAnnualAction={async () => undefined}
      />,
    );

    expect(html).toContain('Subscribe Monthly');
    expect(html).toContain('Subscribe Annual');
    expect(html).not.toContain('Subscription needs attention');
    expect(html).not.toContain('Manage Billing');
  });

  it('renders renewal disclosure before each trial CTA', () => {
    const html = renderToStaticMarkup(
      <PricingView
        isEntitled={false}
        banner={null}
        showTrialCtas
        subscribeMonthlyAction={async () => undefined}
        subscribeAnnualAction={async () => undefined}
      />,
    );
    const trialCtaCount =
      html.match(/>Start 7-day free trial<\//g)?.length ?? 0;

    expect(trialCtaCount).toBe(2);
    expect(html).toContain(
      'If you add a payment method before the trial ends, Pro Monthly starts at $29 per month',
    );
    expect(html).toContain(
      'If you do not add a payment method, the trial ends and you are not charged.',
    );
    expect(html).toContain(
      'If you add a payment method before the trial ends, Pro Annual starts at $199 per year',
    );
    expect(html.indexOf('Pro Monthly starts at $29 per month')).toBeLessThan(
      html.indexOf('Start 7-day free trial'),
    );
    expect(html).not.toContain('Subscribe Monthly');
    expect(html).not.toContain('Subscribe Annual');
  });

  it('renders standard subscribe CTAs for non-trial-eligible visitors by default', () => {
    const html = renderToStaticMarkup(
      <PricingView
        isEntitled={false}
        banner={null}
        subscribeMonthlyAction={async () => undefined}
        subscribeAnnualAction={async () => undefined}
      />,
    );

    expect(html).toContain('Subscribe Monthly');
    expect(html).toContain('Subscribe Annual');
    expect(html).toContain(
      '$29 is charged when Pro Monthly starts and it renews automatically every month until canceled.',
    );
    expect(html).toContain(
      '$199 is charged when Pro Annual starts and it renews automatically every year until canceled.',
    );
    expect(html.indexOf('$29 is charged when Pro Monthly starts')).toBeLessThan(
      html.indexOf('Subscribe Monthly'),
    );
    expect(html).not.toContain('Start 7-day free trial');
    expect(html).not.toContain(
      'If you do not add a payment method, the trial ends',
    );
  });

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
