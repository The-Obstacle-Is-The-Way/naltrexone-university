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

const TerminalSubscriptionStatuses: readonly SubscriptionStatus[] = [
  'canceled',
  'paymentFailed',
];

function isTerminalSubscriptionStatus(status: SubscriptionStatus): boolean {
  return TerminalSubscriptionStatuses.includes(status);
}

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

  if (isTerminalSubscriptionStatus(input.incoming.status)) return false;
  if (!hasEntitledSubscriptionTier(input.incoming.status)) return false;

  const canonicalOrdering = compareCanonicalSubscriptionCandidates(
    input.incoming,
    input.stored,
  );
  return canonicalOrdering < 0;
}
