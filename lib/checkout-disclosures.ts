// DEBT-414 F15: every checkout consent text ever shown, by disclosure version.
//
// A Checkout Session's metadata cannot carry a consent text longer than
// Stripe's 500-character value limit, so a session may carry only the
// disclosure version and the text's SHA-256; the webhook rebuilds the exact
// text from this registry and verifies the hash before recording consent.
//
// Entries are append-only evidence. Never edit a registered text: changing
// the consent copy means registering it under a new disclosure version.
// lib/checkout-disclosures.test.ts pins each text's SHA-256 and requires the
// live copy for the current version to match its entry.

type CheckoutPlan = 'monthly' | 'annual';

type RegisteredDisclosures = Readonly<
  Record<CheckoutPlan, { readonly trial: string; readonly standard: string }>
>;

export const CHECKOUT_DISCLOSURE_REGISTRY: Readonly<
  Record<string, RegisteredDisclosures>
> = {
  '2026-09-16': {
    monthly: {
      trial:
        'Plan: Pro Monthly\nTrial: 7 days free; no payment method required. Without one, trial ends with no charge.\nAfter trial: If you add a payment method before trial end: $29 per month, renewing automatically every month until canceled.\nCancel: Before trial ends or your next billing date via the Billing page or support@addictionboards.com.\nBy selecting "Start free trial", you agree to these renewal terms. Review our Terms of Service and Privacy Policy.',
      standard:
        'Plan: Pro Monthly\nBilling: $29 per month, charged today and renewing automatically every month until canceled.\nCancel: Before your next billing date via the Billing page or support@addictionboards.com.\nBy selecting "Subscribe", you authorize recurring monthly charges. Review our Terms of Service and Privacy Policy.',
    },
    annual: {
      trial:
        'Plan: Pro Annual\nTrial: 7 days free; no payment method required. Without one, trial ends with no charge.\nAfter trial: If you add a payment method before trial end: $199 per year, renewing automatically every year until canceled.\nCancel: Before trial ends or your next billing date via the Billing page or support@addictionboards.com.\nBy selecting "Start free trial", you agree to these renewal terms. Review our Terms of Service and Privacy Policy.',
      standard:
        'Plan: Pro Annual\nBilling: $199 per year, charged today and renewing automatically every year until canceled.\nCancel: Before your next billing date via the Billing page or support@addictionboards.com.\nBy selecting "Subscribe", you authorize recurring annual charges. Review our Terms of Service and Privacy Policy.',
    },
  },
};

export function resolveCheckoutDisclosure(input: {
  disclosureVersion: string;
  plan: CheckoutPlan;
  hasTrial: boolean;
}): string | null {
  const version = Object.hasOwn(
    CHECKOUT_DISCLOSURE_REGISTRY,
    input.disclosureVersion,
  )
    ? CHECKOUT_DISCLOSURE_REGISTRY[input.disclosureVersion]
    : undefined;
  if (version === undefined) return null;
  return version[input.plan][input.hasTrial ? 'trial' : 'standard'];
}
