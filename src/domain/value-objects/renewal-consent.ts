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

export function computeRenewalConsentRetainUntil(
  acceptedAt: Date,
  subscriptionTerminatedAt: Date | null,
): Date {
  const consentFloor = addUtcYears(acceptedAt, 3);
  if (!subscriptionTerminatedAt) return consentFloor;

  const terminationFloor = addUtcYears(subscriptionTerminatedAt, 1);
  return terminationFloor > consentFloor ? terminationFloor : consentFloor;
}
