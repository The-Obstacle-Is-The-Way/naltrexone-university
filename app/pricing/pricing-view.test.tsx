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

  it('renders trial CTAs with post-trial notes for trial-eligible visitors', () => {
    const html = renderToStaticMarkup(
      <PricingView
        isEntitled={false}
        banner={null}
        showTrialCtas
        subscribeMonthlyAction={async () => undefined}
        subscribeAnnualAction={async () => undefined}
      />,
    );
    const trialCtaCount = html.match(/Start 7-day free trial/g)?.length ?? 0;

    expect(trialCtaCount).toBe(2);
    expect(html).toContain('then $29/mo');
    expect(html).toContain('then $199/yr · no card required');
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
    expect(html).not.toContain('Start 7-day free trial');
    expect(html).not.toContain('then $29/mo');
    expect(html).not.toContain('no card required');
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
