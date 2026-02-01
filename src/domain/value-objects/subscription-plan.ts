/**
 * Domain-level subscription plan identifiers.
 * These are intentionally vendor-agnostic.
 */
export const AllSubscriptionPlans = ['monthly', 'annual'] as const;

export type SubscriptionPlan = (typeof AllSubscriptionPlans)[number];

export function isValidSubscriptionPlan(
  value: string,
): value is SubscriptionPlan {
  return AllSubscriptionPlans.includes(value as SubscriptionPlan);
}
