import { describe, expect, it } from 'vitest';
import { PRICING_DATA } from '@/lib/pricing-data';

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

  it.each(
    disclosures,
  )('%s names the real cancellation path (Billing page), not a nonexistent surface', (_name, disclosure) => {
    expect(disclosure).toContain('Billing page');
    expect(disclosure).not.toContain('Account Settings');
  });

  it.each(
    disclosures,
  )('%s names the support contact as a cancellation fallback', (_name, disclosure) => {
    expect(disclosure).toContain('support@addictionboards.com');
  });
});
