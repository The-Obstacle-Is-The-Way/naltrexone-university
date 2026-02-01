/**
 * Stripe subscription status values.
 * @see https://stripe.com/docs/api/subscriptions/object#subscription_object-status
 */
export const AllSubscriptionStatuses = [
  'incomplete',
  'incomplete_expired',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'paused',
] as const;

export type SubscriptionStatus = (typeof AllSubscriptionStatuses)[number];

/**
 * Statuses that grant access to premium features.
 */
export const EntitledStatuses: readonly SubscriptionStatus[] = [
  'active',
  'trialing',
];

/**
 * Check if a status grants entitlement.
 */
export function isEntitledStatus(status: SubscriptionStatus): boolean {
  return EntitledStatuses.includes(status);
}
