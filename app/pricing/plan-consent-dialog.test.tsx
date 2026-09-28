// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { createCheckoutRenewalTerms, PRICING_DATA } from '@/lib/pricing-data';
import { ROUTES } from '@/lib/routes';
import { parseHtml } from '@/tests/shared/dom-helpers';

let PlanConsentDialog: typeof import('./plan-consent-dialog').PlanConsentDialog;
let PlanConsentDetails: typeof import('./plan-consent-dialog').PlanConsentDetails;

beforeAll(async () => {
  ({ PlanConsentDialog, PlanConsentDetails } = await import(
    './plan-consent-dialog'
  ));
});

describe('plan consent rendering', () => {
  for (const plan of ['monthly', 'annual'] as const) {
    for (const hasTrial of [true, false]) {
      it(`renders the ${plan} ${hasTrial ? 'trial' : 'standard'} trigger without closed dialog copy`, () => {
        const doc = parseHtml(
          renderToStaticMarkup(
            <PlanConsentDialog
              plan={plan}
              hasTrial={hasTrial}
              subscribeAction={async () => undefined}
            />,
          ),
        );
        expect(doc.querySelector('button')?.textContent).toBe(
          hasTrial
            ? 'Start 7-day free trial'
            : plan === 'monthly'
              ? 'Subscribe monthly'
              : 'Subscribe annual',
        );
        expect(
          doc.querySelector('dialog, [role="dialog"], dl, form'),
        ).toBeNull();
      });

      // DEBT-414 F03: a separate, unchecked, required renewal opt-in.
      it(`offers an unchecked, required ${plan} ${hasTrial ? 'trial' : 'standard'} renewal opt-in`, () => {
        const doc = parseHtml(
          renderToStaticMarkup(
            <PlanConsentDetails plan={plan} hasTrial={hasTrial} />,
          ),
        );
        const checkbox = doc.querySelector<HTMLInputElement>(
          'input[type="checkbox"]',
        );

        expect(checkbox?.name).toBe('renewalOptIn');
        expect(checkbox?.value).toBe('yes');
        expect(checkbox?.required).toBe(true);
        expect(checkbox?.checked).toBe(false);
        expect(checkbox?.closest('label')?.textContent).toBe(
          PRICING_DATA[plan].consent[hasTrial ? 'trial' : 'standard'].optIn,
        );
      });

      it(`renders ${plan} ${hasTrial ? 'trial' : 'standard'} terms exactly as recorded`, () => {
        const doc = parseHtml(
          renderToStaticMarkup(
            <PlanConsentDetails plan={plan} hasTrial={hasTrial} />,
          ),
        );
        const rows = Array.from(
          doc.querySelectorAll('dl > div'),
          (row) =>
            `${row.querySelector('dt')?.textContent} ${row.querySelector('dd')?.textContent}`,
        );
        expect(rows).toHaveLength(hasTrial ? 5 : 4);
        expect(
          [
            ...rows,
            doc.querySelector('label')?.textContent,
            doc.querySelector('p')?.textContent,
          ].join('\n'),
        ).toBe(createCheckoutRenewalTerms(plan, hasTrial).disclosureSnapshot);
        expect(
          doc.querySelector(`a[href="${ROUTES.TERMS}"]`)?.textContent,
        ).toBe('Terms of Service');
        expect(
          doc.querySelector(`a[href="${ROUTES.PRIVACY}"]`)?.textContent,
        ).toBe('Privacy Policy');
        expect(doc.querySelector('p')?.textContent).toContain(
          `"${PRICING_DATA[plan].consent[hasTrial ? 'trial' : 'standard'].buttonLabel}"`,
        );
      });
    }
  }
});
