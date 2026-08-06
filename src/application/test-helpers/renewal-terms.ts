import type { RenewalTermsSnapshot } from '@/src/application/ports/gateways';

export function createTestRenewalTerms(
  plan: 'monthly' | 'annual' = 'monthly',
  hasTrial = false,
): RenewalTermsSnapshot {
  return {
    plan,
    amountCents: plan === 'monthly' ? 2900 : 19900,
    currency: 'usd',
    frequency: plan === 'monthly' ? 'month' : 'year',
    disclosureVersion: '2026-08-05',
    termsVersion: '2026-08-05',
    termsHash: 'test-terms-hash',
    disclosureSnapshot: hasTrial
      ? 'Test trial renewal disclosure.'
      : 'Test immediate renewal disclosure.',
    cancellationMethod:
      'Billing page in the app or support@addictionboards.com',
  };
}

export function createTestCheckoutRenewalMetadata(input: {
  userId: string;
  plan?: 'monthly' | 'annual';
  hasTrial?: boolean;
}): Record<string, string> {
  const terms = createTestRenewalTerms(
    input.plan ?? 'monthly',
    input.hasTrial ?? false,
  );
  return {
    checkout_variant: input.hasTrial ? 'trial:7' : 'standard',
    renewal_user_id: input.userId,
    renewal_plan: terms.plan,
    renewal_amount_cents: String(terms.amountCents),
    renewal_currency: terms.currency,
    renewal_frequency: terms.frequency,
    renewal_disclosure_snapshot: terms.disclosureSnapshot,
    renewal_disclosure_version: terms.disclosureVersion,
    renewal_terms_version: terms.termsVersion,
    renewal_terms_hash: terms.termsHash,
    renewal_cancellation_method: terms.cancellationMethod,
  };
}
