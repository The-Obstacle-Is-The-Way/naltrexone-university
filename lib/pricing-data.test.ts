import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { termsContent } from '@/app/(marketing)/terms/terms-content';
import consentRuling from '@/docs/debt/assets/debt-414/f03-consent-ruling-data.json';
import {
  ANNUAL_RENEWAL_NOTICE_VERSION,
  CANCELLATION_METHOD,
  createCheckoutRenewalTerms,
  createTrialPaymentRenewalTerms,
  MONTHLY_ANNIVERSARY_NOTICE_VERSION,
  PRICING_DATA,
  TERMS_CONTENT_SHA256,
  TERMS_VERSION,
  TRIAL_PAYMENT_DISCLOSURE_VERSION,
} from '@/lib/pricing-data';
import { CANCELLATION_AND_REFUND_POLICY } from '@/src/application/shared/renewal-notice-email-format';

// ROSCA / NY GBL § 527-a: the renewal disclosure must accurately describe the
// simple cancellation mechanism. The app's actual path is the "Billing" nav
// item (ROUTES.APP_BILLING → Stripe billing portal); there is no
// "Account Settings" surface in the app, so naming one would misdescribe the
// cancellation method in consumer-facing legal copy.
describe('PRICING_DATA renewal disclosures', () => {
  const disclosures = [
    [
      'monthly.trialDisclosure',
      createCheckoutRenewalTerms('monthly', true).disclosureSnapshot,
    ],
    [
      'monthly.standardDisclosure',
      createCheckoutRenewalTerms('monthly', false).disclosureSnapshot,
    ],
    [
      'monthly.trialPaymentDisclosure',
      PRICING_DATA.monthly.trialPaymentDisclosure,
    ],
    [
      'annual.trialDisclosure',
      createCheckoutRenewalTerms('annual', true).disclosureSnapshot,
    ],
    [
      'annual.standardDisclosure',
      createCheckoutRenewalTerms('annual', false).disclosureSnapshot,
    ],
    [
      'annual.trialPaymentDisclosure',
      PRICING_DATA.annual.trialPaymentDisclosure,
    ],
  ] as const;

  it.each(disclosures)(
    '%s names the real cancellation path (Billing page), not a nonexistent surface',
    (_name, disclosure) => {
      expect(disclosure).toContain('Billing page');
      expect(disclosure).not.toContain('Account Settings');
    },
  );

  it.each(disclosures)(
    '%s names the support contact as a cancellation fallback',
    (_name, disclosure) => {
      expect(disclosure).toContain('support@addictionboards.com');
    },
  );

  // DEBT-414 F15: the operative cancellation and refund policy sits next to
  // every consent, quoted from Terms § 4. Checkout Sessions carry these texts
  // by hash (lib/checkout-disclosures.ts), so their length is not bounded by
  // Stripe's 500-character metadata values.
  it.each(disclosures)(
    '%s states the cancellation and refund policy',
    (_name, disclosure) => {
      expect(disclosure).toContain(CANCELLATION_AND_REFUND_POLICY);
    },
  );

  it('quotes each clause of the policy from Terms § 4', () => {
    const terms = termsContent.bodyMarkdown.replaceAll('**', '');
    for (const clause of CANCELLATION_AND_REFUND_POLICY.split(/(?<=\.) /)) {
      expect(terms).toContain(clause.replace(/\.$/, ''));
    }
  });

  it('pins machine-readable renewal terms to the rendered disclosure and Terms version', () => {
    expect(CANCELLATION_METHOD).toBe(
      'Billing page in the app or support@addictionboards.com',
    );
    expect(PRICING_DATA.monthly).toMatchObject({
      amountCents: 2900,
      currency: 'usd',
      frequency: 'month',
      disclosureVersion: '2026-09-28.2',
    });
    expect(PRICING_DATA.annual).toMatchObject({
      amountCents: 19900,
      currency: 'usd',
      frequency: 'year',
      disclosureVersion: '2026-09-28.2',
    });
    expect(TERMS_VERSION).toBe('2026-08-09');
    expect(TERMS_CONTENT_SHA256).toBe(
      'b3359b6ae63ba92bd24c7a099deaa366ba6f2a0fa5562611a30672cdb87e450f',
    );
    expect(TERMS_CONTENT_SHA256).toBe(
      createHash('sha256').update(termsContent.bodyMarkdown).digest('hex'),
    );
  });

  it.each(['monthly', 'annual'] as const)(
    'records the exact approved %s consent text and version for both offers',
    (plan) => {
      for (const hasTrial of [true, false]) {
        const ruling = consentRuling.cases.find(
          (entry) => entry.plan === plan && entry.trial === hasTrial,
        );
        const consent =
          PRICING_DATA[plan].consent[hasTrial ? 'trial' : 'standard'];
        expect(ruling).toBeDefined();
        expect(consent.rows).toEqual(ruling?.rows);
        // DEBT-414 F03: the separate renewal opt-in, recorded verbatim.
        expect(consent.optIn).toBe(ruling?.optIn);
        expect(consent.sentence).toBe(ruling?.sentence);
        expect(consent.buttonLabel).toBe(ruling?.button);
        expect(createCheckoutRenewalTerms(plan, hasTrial)).toMatchObject({
          plan,
          disclosureSnapshot: ruling?.snapshot,
          disclosureVersion: consentRuling.disclosureVersion,
          termsVersion: TERMS_VERSION,
          termsHash: TERMS_CONTENT_SHA256,
          cancellationMethod: CANCELLATION_METHOD,
        });
      }
    },
  );

  it('records the exact proposed add-card text under its own new version', () => {
    expect(TRIAL_PAYMENT_DISCLOSURE_VERSION).toBe(
      consentRuling.trialPaymentDisclosureVersion,
    );
    expect(PRICING_DATA.monthly.trialPaymentDisclosure).toBe(
      consentRuling.trialPaymentDisclosures.monthly,
    );
    expect(PRICING_DATA.annual.trialPaymentDisclosure).toBe(
      consentRuling.trialPaymentDisclosures.annual,
    );
  });

  it('keeps the annual-notice version independent of checkout consent', () => {
    expect(ANNUAL_RENEWAL_NOTICE_VERSION).toBe('2026-08-05');
    expect(ANNUAL_RENEWAL_NOTICE_VERSION).not.toBe(
      PRICING_DATA.annual.disclosureVersion,
    );
  });

  // DEBT-414 F02: the monthly subscriber's yearly reminder has its own
  // disclosure version, so its wording can change without re-queuing the
  // annual notices.
  it('versions the monthly anniversary reminder separately', () => {
    expect(MONTHLY_ANNIVERSARY_NOTICE_VERSION).toBe('2026-09-27');
    expect(MONTHLY_ANNIVERSARY_NOTICE_VERSION).not.toBe(
      ANNUAL_RENEWAL_NOTICE_VERSION,
    );
  });

  it('builds trial-payment renewal snapshots from the pricing source of truth', () => {
    expect(createTrialPaymentRenewalTerms('monthly')).toEqual({
      plan: 'monthly',
      amountCents: 2_900,
      currency: 'usd',
      frequency: 'month',
      disclosureSnapshot: PRICING_DATA.monthly.trialPaymentDisclosure,
      disclosureVersion: TRIAL_PAYMENT_DISCLOSURE_VERSION,
      termsVersion: TERMS_VERSION,
      termsHash: TERMS_CONTENT_SHA256,
      cancellationMethod: CANCELLATION_METHOD,
    });
    expect(createTrialPaymentRenewalTerms('annual')).toEqual({
      plan: 'annual',
      amountCents: 19_900,
      currency: 'usd',
      frequency: 'year',
      disclosureSnapshot: PRICING_DATA.annual.trialPaymentDisclosure,
      disclosureVersion: TRIAL_PAYMENT_DISCLOSURE_VERSION,
      termsVersion: TERMS_VERSION,
      termsHash: TERMS_CONTENT_SHA256,
      cancellationMethod: CANCELLATION_METHOD,
    });
  });
});
