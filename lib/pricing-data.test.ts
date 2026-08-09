import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { termsContent } from '@/app/(marketing)/terms/terms-content';
import {
  CANCELLATION_METHOD,
  PRICING_DATA,
  TERMS_CONTENT_SHA256,
  TERMS_VERSION,
} from '@/lib/pricing-data';

// ROSCA / NY GBL § 527-a: the renewal disclosure must accurately describe the
// simple cancellation mechanism. The app's actual path is the "Billing" nav
// item (ROUTES.APP_BILLING → Stripe billing portal); there is no
// "Account Settings" surface in the app, so naming one would misdescribe the
// cancellation method in consumer-facing legal copy.
describe('PRICING_DATA renewal disclosures', () => {
  const disclosures = [
    ['monthly.trialDisclosure', PRICING_DATA.monthly.trialDisclosure],
    ['monthly.standardDisclosure', PRICING_DATA.monthly.standardDisclosure],
    [
      'monthly.trialPaymentDisclosure',
      PRICING_DATA.monthly.trialPaymentDisclosure,
    ],
    ['annual.trialDisclosure', PRICING_DATA.annual.trialDisclosure],
    ['annual.standardDisclosure', PRICING_DATA.annual.standardDisclosure],
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

  it('pins machine-readable renewal terms to the rendered disclosure and Terms version', () => {
    expect(CANCELLATION_METHOD).toBe(
      'Billing page in the app or support@addictionboards.com',
    );
    expect(PRICING_DATA.monthly).toMatchObject({
      amountCents: 2900,
      currency: 'usd',
      frequency: 'month',
      disclosureVersion: '2026-08-05',
    });
    expect(PRICING_DATA.annual).toMatchObject({
      amountCents: 19900,
      currency: 'usd',
      frequency: 'year',
      disclosureVersion: '2026-08-05',
    });
    expect(TERMS_VERSION).toBe('2026-08-09');
    expect(TERMS_CONTENT_SHA256).toBe(
      'b3359b6ae63ba92bd24c7a099deaa366ba6f2a0fa5562611a30672cdb87e450f',
    );
    expect(TERMS_CONTENT_SHA256).toBe(
      createHash('sha256').update(termsContent.bodyMarkdown).digest('hex'),
    );
  });
});
