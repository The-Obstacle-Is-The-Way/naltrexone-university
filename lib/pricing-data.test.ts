import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { termsContent } from '@/app/(marketing)/terms/terms-content';
import consentRuling from '@/docs/debt/assets/debt-478/consent-ruling-data.json';
import {
  ANNUAL_RENEWAL_NOTICE_VERSION,
  CANCELLATION_METHOD,
  createCheckoutRenewalTerms,
  createTrialPaymentRenewalTerms,
  PRICING_DATA,
  TERMS_CONTENT_SHA256,
  TERMS_VERSION,
  TRIAL_PAYMENT_DISCLOSURE_VERSION,
} from '@/lib/pricing-data';

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

  it.each(['monthly', 'annual'] as const)(
    'keeps every %s consent snapshot within the 480-character metadata budget',
    (plan) => {
      for (const snapshot of [
        createCheckoutRenewalTerms(plan, true),
        createCheckoutRenewalTerms(plan, false),
        createTrialPaymentRenewalTerms(plan),
      ]) {
        expect(snapshot.disclosureSnapshot.length).toBeLessThanOrEqual(480);
      }
    },
  );

  it('pins machine-readable renewal terms to the rendered disclosure and Terms version', () => {
    expect(CANCELLATION_METHOD).toBe(
      'Billing page in the app or support@addictionboards.com',
    );
    expect(PRICING_DATA.monthly).toMatchObject({
      amountCents: 2900,
      currency: 'usd',
      frequency: 'month',
      disclosureVersion: '2026-09-16',
    });
    expect(PRICING_DATA.annual).toMatchObject({
      amountCents: 19900,
      currency: 'usd',
      frequency: 'year',
      disclosureVersion: '2026-09-16',
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
        expect(consent.sentence).toBe(ruling?.sentence);
        expect(consent.buttonLabel).toBe(ruling?.button);
        expect(createCheckoutRenewalTerms(plan, hasTrial)).toMatchObject({
          plan,
          disclosureSnapshot: ruling?.snapshot,
          disclosureVersion: '2026-09-16',
          termsVersion: TERMS_VERSION,
          termsHash: TERMS_CONTENT_SHA256,
          cancellationMethod: CANCELLATION_METHOD,
        });
      }
    },
  );

  it('keeps unchanged add-card and annual-notice versions independent of checkout consent', () => {
    expect(ANNUAL_RENEWAL_NOTICE_VERSION).toBe('2026-08-05');
    expect(TRIAL_PAYMENT_DISCLOSURE_VERSION).toBe('2026-08-05');
    expect(ANNUAL_RENEWAL_NOTICE_VERSION).not.toBe(
      PRICING_DATA.annual.disclosureVersion,
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
