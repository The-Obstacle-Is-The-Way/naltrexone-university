import type { SubscriptionStatus } from '../value-objects';
import {
  compareCanonicalSubscriptionCandidates,
  hasEntitledSubscriptionTier,
} from './subscription-canonicalization';

export type SubscriptionWriteCandidate = {
  subscriptionIdentity: string;
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
};

function isCurrentEntitledSubscription(
  candidate: SubscriptionWriteCandidate,
  now: Date,
): boolean {
  return (
    hasEntitledSubscriptionTier(candidate.status) &&
    candidate.currentPeriodEnd > now
  );
}

export function shouldPersistSubscriptionWrite(input: {
  stored: SubscriptionWriteCandidate | null;
  incoming: SubscriptionWriteCandidate;
  now: Date;
}): boolean {
  if (!input.stored) return true;
  if (
    input.stored.subscriptionIdentity === input.incoming.subscriptionIdentity
  ) {
    return true;
  }

  if (!isCurrentEntitledSubscription(input.stored, input.now)) {
    return true;
  }

  // The stored subscription is current and entitled here. Canonical ordering
  // ranks entitlement first, so a non-entitled incoming status (including the
  // terminal canceled and paymentFailed) always orders after it and is refused.
  const canonicalOrdering = compareCanonicalSubscriptionCandidates(
    input.incoming,
    input.stored,
  );
  // Stryker disable next-line EqualityOperator: ordering is 0 only for identical identities, which returned above, so <= 0 is equivalent
  return canonicalOrdering < 0;
}
