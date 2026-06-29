import {
  type CanonicalSubscriptionCandidate,
  compareCanonicalSubscriptionCandidates as compareDomainCanonicalSubscriptionCandidates,
} from '@/src/domain/services/subscription-canonicalization';

export type { CanonicalSubscriptionCandidate };

export function compareCanonicalSubscriptionCandidates(
  a: CanonicalSubscriptionCandidate,
  b: CanonicalSubscriptionCandidate,
): number {
  return compareDomainCanonicalSubscriptionCandidates(a, b);
}
