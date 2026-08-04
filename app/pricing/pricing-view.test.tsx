// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PricingBanner } from '@/app/pricing/types';
import { PRICING_DATA } from '@/lib/pricing-data';
import { ROUTES } from '@/lib/routes';
import {
  findAnchorByHref,
  findButtonByText,
  findElementByText,
  findHeadingByText,
  isNodeBefore,
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
    const doc = parseHtml(html);
    const monthlyCard = findHeadingByText(doc, PRICING_DATA.monthly.name, {
      level: 3,
    })?.closest('[data-slot="card"]');
    const annualCard = findHeadingByText(doc, PRICING_DATA.annual.name, {
      level: 3,
    })?.closest('[data-slot="card"]');
    const monthlyDisclosure = monthlyCard
      ? findElementByText(
          monthlyCard,
          'p',
          PRICING_DATA.monthly.trialDisclosure,
        )
      : null;
    const annualDisclosure = annualCard
      ? findElementByText(annualCard, 'p', PRICING_DATA.annual.trialDisclosure)
      : null;
    const monthlyCta = monthlyCard
      ? findButtonByText(monthlyCard, PRICING_DATA.monthly.trialCta)
      : null;
    const annualCta = annualCard
      ? findButtonByText(annualCard, PRICING_DATA.annual.trialCta)
      : null;

    expect(monthlyDisclosure).not.toBeNull();
    expect(annualDisclosure).not.toBeNull();
    expect(monthlyCta).not.toBeNull();
    expect(annualCta).not.toBeNull();
    expect(
      monthlyDisclosure && monthlyCta
        ? isNodeBefore(monthlyDisclosure, monthlyCta)
        : false,
    ).toBe(true);
    expect(
      annualDisclosure && annualCta
        ? isNodeBefore(annualDisclosure, annualCta)
        : false,
    ).toBe(true);
    expect(html).not.toContain('Subscribe Monthly');
    expect(html).not.toContain('Subscribe Annual');
  });

  it('renders legal links inside each disclosure block before its CTA', () => {
    const html = renderToStaticMarkup(
      <PricingView
        isEntitled={false}
        banner={null}
        showTrialCtas
        subscribeMonthlyAction={async () => undefined}
        subscribeAnnualAction={async () => undefined}
      />,
    );
    const doc = parseHtml(html);

    for (const plan of ['monthly', 'annual'] as const) {
      const card = findHeadingByText(doc, PRICING_DATA[plan].name, {
        level: 3,
      })?.closest('[data-slot="card"]');
      const disclosure = card
        ? findElementByText(card, 'p', PRICING_DATA[plan].trialDisclosure)
        : null;
      const disclosureBlock = disclosure?.parentElement ?? null;
      const termsLink = disclosureBlock
        ? findAnchorByHref(disclosureBlock, ROUTES.TERMS)
        : null;
      const privacyLink = disclosureBlock
        ? findAnchorByHref(disclosureBlock, ROUTES.PRIVACY)
        : null;
      const cta = card
        ? findButtonByText(card, PRICING_DATA[plan].trialCta)
        : null;

      expect(termsLink?.textContent).toBe('Terms of Service');
      expect(privacyLink?.textContent).toBe('Privacy Policy');
      expect(
        disclosureBlock && cta ? isNodeBefore(disclosureBlock, cta) : false,
      ).toBe(true);
    }
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
    const doc = parseHtml(html);
    const monthlyCard = findHeadingByText(doc, PRICING_DATA.monthly.name, {
      level: 3,
    })?.closest('[data-slot="card"]');
    const annualCard = findHeadingByText(doc, PRICING_DATA.annual.name, {
      level: 3,
    })?.closest('[data-slot="card"]');
    const monthlyDisclosure = monthlyCard
      ? findElementByText(
          monthlyCard,
          'p',
          PRICING_DATA.monthly.standardDisclosure,
        )
      : null;
    const annualDisclosure = annualCard
      ? findElementByText(
          annualCard,
          'p',
          PRICING_DATA.annual.standardDisclosure,
        )
      : null;
    const monthlyCta = monthlyCard
      ? findButtonByText(monthlyCard, 'Subscribe Monthly')
      : null;
    const annualCta = annualCard
      ? findButtonByText(annualCard, 'Subscribe Annual')
      : null;

    expect(monthlyDisclosure).not.toBeNull();
    expect(annualDisclosure).not.toBeNull();
    expect(
      monthlyDisclosure && monthlyCta
        ? isNodeBefore(monthlyDisclosure, monthlyCta)
        : false,
    ).toBe(true);
    expect(
      annualDisclosure && annualCta
        ? isNodeBefore(annualDisclosure, annualCta)
        : false,
    ).toBe(true);
    expect(
      findElementByText(doc, 'p', PRICING_DATA.monthly.trialDisclosure),
    ).toBeNull();
    expect(
      findElementByText(doc, 'p', PRICING_DATA.annual.trialDisclosure),
    ).toBeNull();
    expect(findButtonByText(doc, PRICING_DATA.monthly.trialCta)).toBeNull();
    expect(findButtonByText(doc, PRICING_DATA.annual.trialCta)).toBeNull();
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
