import type { SubscriptionPlan } from '@/src/domain/value-objects';

export type StripePriceIds = {
  monthly: string;
  annual: string;
};

export function getStripePriceId(
  plan: SubscriptionPlan,
  priceIds: StripePriceIds,
): string {
  return plan === 'monthly' ? priceIds.monthly : priceIds.annual;
}

export function getSubscriptionPlanFromPriceId(
  priceId: string,
  priceIds: StripePriceIds,
): SubscriptionPlan | null {
  if (priceId === priceIds.monthly) return 'monthly';
  if (priceId === priceIds.annual) return 'annual';
  return null;
}
