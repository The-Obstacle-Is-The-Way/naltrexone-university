import { isEntitledStatus, type SubscriptionStatus } from '../value-objects';

export type CanonicalSubscriptionCandidate = {
  subscriptionIdentity: string;
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
};

export function subscriptionEntitlementTier(
  status: SubscriptionStatus,
): number {
  return isEntitledStatus(status) ? 1 : 0;
}

export function hasEntitledSubscriptionTier(
  status: SubscriptionStatus,
): boolean {
  return subscriptionEntitlementTier(status) > 0;
}

export function compareCanonicalSubscriptionCandidates(
  a: CanonicalSubscriptionCandidate,
  b: CanonicalSubscriptionCandidate,
): number {
  const tierDiff =
    subscriptionEntitlementTier(b.status) -
    subscriptionEntitlementTier(a.status);
  if (tierDiff !== 0) return tierDiff;

  const periodDiff =
    b.currentPeriodEnd.getTime() - a.currentPeriodEnd.getTime();
  if (periodDiff !== 0) return periodDiff;

  return a.subscriptionIdentity.localeCompare(b.subscriptionIdentity);
}
