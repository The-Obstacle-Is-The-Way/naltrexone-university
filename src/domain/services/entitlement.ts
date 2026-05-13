import type { Subscription } from '../entities';
import { isEntitledStatus, type SubscriptionStatus } from '../value-objects';

export type NonEntitledReason =
  | 'subscription_required'
  | 'subscription_canceled'
  | 'payment_processing'
  | 'manage_billing';

/**
 * Check if a subscription grants entitlement (pure function).
 */
export function isEntitled(
  subscription: Subscription | null,
  now: Date,
): boolean {
  if (!subscription) return false;
  if (!isEntitledStatus(subscription.status)) return false;
  if (subscription.currentPeriodEnd <= now) return false;
  return true;
}

export function determineNonEntitledReason(
  status: SubscriptionStatus,
  hasActiveSubscriptionPeriod: boolean,
): NonEntitledReason {
  if (!hasActiveSubscriptionPeriod) return 'subscription_required';
  if (status === 'canceled') return 'subscription_canceled';
  if (status === 'paymentProcessing') return 'payment_processing';
  if (status === 'paymentFailed') return 'subscription_required';
  return 'manage_billing';
}
