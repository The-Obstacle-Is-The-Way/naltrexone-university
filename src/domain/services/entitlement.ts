import type { Subscription } from '../entities';
import { isEntitledStatus } from '../value-objects';

/**
 * Check if a subscription grants entitlement (pure function).
 */
export function isEntitled(
  subscription: Subscription | null,
  now: Date = new Date(),
): boolean {
  if (!subscription) return false;
  if (!isEntitledStatus(subscription.status)) return false;
  if (subscription.currentPeriodEnd <= now) return false;
  return true;
}
