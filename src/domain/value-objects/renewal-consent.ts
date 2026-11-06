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
  ...[acceptedAt, subscriptionTerminatedAt]:
    | [acceptedAt: Date, subscriptionTerminatedAt: Date | null]
    | [acceptedAt: null, subscriptionTerminatedAt: Date]
): Date {
  if (acceptedAt === null) {
    return addUtcYears(
      subscriptionTerminatedAt,
      POST_TERMINATION_RETENTION_YEARS,
    );
  }
  const consentFloor = addUtcYears(acceptedAt, CONSENT_RETENTION_YEARS);
  if (!subscriptionTerminatedAt) return consentFloor;

  const terminationFloor = addUtcYears(
    subscriptionTerminatedAt,
    POST_TERMINATION_RETENTION_YEARS,
  );
  // biome-ignore-start lint/complexity/useMathMinMax: both operands are Dates, which the rule's docs exclude but it cannot infer here; Math.max would return a number, not a Date.
  // Stryker disable next-line EqualityOperator: at equal instants either branch yields the same time
  return terminationFloor > consentFloor ? terminationFloor : consentFloor;
  // biome-ignore-end lint/complexity/useMathMinMax: end of the Date comparison above.
}
