// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PricingBanner } from '@/app/pricing/types';
import { PRICING_DATA } from '@/lib/pricing-data';
import { ROUTES } from '@/lib/routes';
import {
  findAnchorByHref,
  findButtonByText,
  findHeadingByText,
  parseHtml,
} from '@/tests/shared/dom-helpers';

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

    expect(html).toContain('Subscribe monthly');
    expect(html).toContain('Subscribe annual');
    expect(html).not.toContain('Subscription needs attention');
    expect(html).not.toContain('Manage billing');
  });

  it('keeps both list-bearing plan cards left-aligned', () => {
    const doc = parseHtml(
      renderToStaticMarkup(
        <PricingView
          isEntitled={false}
          banner={null}
          subscribeMonthlyAction={async () => undefined}
          subscribeAnnualAction={async () => undefined}
        />,
      ),
    );
    for (const plan of ['monthly', 'annual'] as const) {
      const card = findHeadingByText(doc, PRICING_DATA[plan].name, {
        level: 3,
      })?.closest('[data-slot="card"]');
      expect(card).not.toBeNull();
      expect(card?.classList.contains('text-center')).toBe(false);
    }
  });

  it.each([true, false])(
    'keeps plan selection free of legal copy when trial eligibility is %s',
    (showTrialCtas) => {
      const doc = parseHtml(
        renderToStaticMarkup(
          <PricingView
            isAuthenticated
            isEntitled={false}
            banner={null}
            showTrialCtas={showTrialCtas}
            subscribeMonthlyAction={async () => undefined}
            subscribeAnnualAction={async () => undefined}
          />,
        ),
      );
      expect(doc.querySelector('dl, form')).toBeNull();
      expect(findAnchorByHref(doc, ROUTES.TERMS)).toBeNull();
      expect(findAnchorByHref(doc, ROUTES.PRIVACY)).toBeNull();
      expect(findAnchorByHref(doc, ROUTES.HOME)).toBeNull();
      const plans = doc.querySelector(
        'section[aria-labelledby="pricing-plans-heading"]',
      );
      expect(plans?.classList.contains('max-w-3xl')).toBe(true);
      expect(plans?.querySelector('h2')?.classList.contains('sr-only')).toBe(
        true,
      );
      expect(
        doc.querySelectorAll('button[aria-haspopup="dialog"]'),
      ).toHaveLength(2);
    },
  );

  it.each([
    { isAuthenticated: true, showTrialCtas: true, visible: true },
    { isAuthenticated: true, showTrialCtas: false, visible: false },
    { isAuthenticated: false, showTrialCtas: true, visible: false },
    { isAuthenticated: false, showTrialCtas: false, visible: false },
  ])(
    'renders the trial footnote only for proven eligibility: $isAuthenticated/$showTrialCtas',
    ({ isAuthenticated, showTrialCtas, visible }) => {
      const html = renderToStaticMarkup(
        <PricingView
          isAuthenticated={isAuthenticated}
          isEntitled={false}
          banner={null}
          showTrialCtas={showTrialCtas}
          subscribeMonthlyAction={async () => undefined}
          subscribeAnnualAction={async () => undefined}
        />,
      );
      expect(
        html.includes(
          '7-day free trial on either plan. No payment method needed. Cancel anytime.',
        ),
      ).toBe(visible);
    },
  );

  it('keeps standard plan labels for returning subscribers', () => {
    const doc = parseHtml(
      renderToStaticMarkup(
        <PricingView
          isAuthenticated
          isEntitled={false}
          banner={null}
          subscribeMonthlyAction={async () => undefined}
          subscribeAnnualAction={async () => undefined}
        />,
      ),
    );
    expect(findButtonByText(doc, 'Subscribe monthly')).not.toBeNull();
    expect(findButtonByText(doc, 'Subscribe annual')).not.toBeNull();
    expect(findButtonByText(doc, PRICING_DATA.monthly.trialCta)).toBeNull();
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
