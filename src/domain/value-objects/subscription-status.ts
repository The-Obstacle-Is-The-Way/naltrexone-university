/**
 * Subscription status values used by the domain.
 *
 * The domain layer treats these as opaque states with entitlement rules defined
 * below. Provider-specific statuses must be translated at the adapter boundary.
 */
export const AllSubscriptionStatuses = [
  'paymentProcessing',
  'paymentFailed',
  'inTrial',
  'active',
  'canceled',
  'unpaid',
  'paused',
  'pastDue',
] as const;

export type SubscriptionStatus = (typeof AllSubscriptionStatuses)[number];

export function isValidSubscriptionStatus(
  value: string,
): value is SubscriptionStatus {
  return AllSubscriptionStatuses.includes(value as SubscriptionStatus);
}

/**
 * Statuses that grant access to premium features.
 */
export const EntitledStatuses: readonly SubscriptionStatus[] = [
  'active',
  'inTrial',
];

/**
 * Check if a status grants entitlement.
 */
export function isEntitledStatus(status: SubscriptionStatus): boolean {
  return EntitledStatuses.includes(status);
}
