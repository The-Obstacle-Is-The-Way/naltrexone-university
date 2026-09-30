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

  const identityOrder = a.subscriptionIdentity.localeCompare(
    b.subscriptionIdentity,
  );
  if (identityOrder !== 0) return identityOrder;
  // localeCompare treats canonically equivalent spellings (NFC and NFD) as
  // equal; code units break that tie, so only identical identities are equal.
  if (a.subscriptionIdentity === b.subscriptionIdentity) return 0;
  // Stryker disable next-line EqualityOperator: identical identities returned 0 above, so `<` and `<=` agree
  return a.subscriptionIdentity < b.subscriptionIdentity ? -1 : 1;
}
