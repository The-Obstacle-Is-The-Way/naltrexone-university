export const AllRenewalConsentKinds = [
  'initial_offer',
  'price_increase',
] as const;

export type RenewalConsentKind = (typeof AllRenewalConsentKinds)[number];

export const AllRenewalConsentSources = [
  'stripe_checkout',
  'stripe_setup',
  'application',
] as const;

export type RenewalConsentSource = (typeof AllRenewalConsentSources)[number];

export type RenewalConsentFrequency = 'month' | 'year';

function addUtcYears(date: Date, years: number): Date {
  const result = new Date(date);
  result.setUTCFullYear(result.getUTCFullYear() + years);
  return result;
}

export const CONSENT_RETENTION_YEARS = 3;
export const POST_TERMINATION_RETENTION_YEARS = 1;

export function computeRenewalConsentRetainUntil(
  acceptedAt: Date,
  subscriptionTerminatedAt: Date | null,
): Date {
  const consentFloor = addUtcYears(acceptedAt, CONSENT_RETENTION_YEARS);
  if (!subscriptionTerminatedAt) return consentFloor;

  const terminationFloor = addUtcYears(
    subscriptionTerminatedAt,
    POST_TERMINATION_RETENTION_YEARS,
  );
  return terminationFloor > consentFloor ? terminationFloor : consentFloor;
}
