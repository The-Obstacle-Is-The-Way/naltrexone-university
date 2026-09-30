import { describe, expect, it } from 'vitest';
import { createSubscriptionWriteCandidate } from '../test-helpers';
import {
  compareCanonicalSubscriptionCandidates,
  subscriptionEntitlementTier,
} from './subscription-canonicalization';

describe('subscription canonicalization', () => {
  it('ranks entitled statuses above non-entitled statuses', () => {
    expect(subscriptionEntitlementTier('active')).toBe(1);
    expect(subscriptionEntitlementTier('inTrial')).toBe(1);
    expect(subscriptionEntitlementTier('pastDue')).toBe(1);
    expect(subscriptionEntitlementTier('unpaid')).toBe(0);
    expect(subscriptionEntitlementTier('paymentProcessing')).toBe(0);
    expect(subscriptionEntitlementTier('paused')).toBe(0);
  });

  it('sorts entitled candidates ahead of later non-entitled candidates', () => {
    const sorted = [
      createSubscriptionWriteCandidate({
        subscriptionIdentity: 'sub_unpaid',
        status: 'unpaid',
        currentPeriodEnd: new Date('2026-08-01T00:00:00.000Z'),
      }),
      createSubscriptionWriteCandidate({
        subscriptionIdentity: 'sub_active',
        status: 'active',
        currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ].sort(compareCanonicalSubscriptionCandidates);

    expect(sorted.map((item) => item.subscriptionIdentity)).toEqual([
      'sub_active',
      'sub_unpaid',
    ]);
  });

  it('sorts by later period end within the same entitlement tier', () => {
    const sorted = [
      createSubscriptionWriteCandidate({
        subscriptionIdentity: 'sub_a',
        status: 'active',
        currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
      }),
      createSubscriptionWriteCandidate({
        subscriptionIdentity: 'sub_b',
        status: 'pastDue',
        currentPeriodEnd: new Date('2026-08-01T00:00:00.000Z'),
      }),
    ].sort(compareCanonicalSubscriptionCandidates);

    expect(sorted.map((item) => item.subscriptionIdentity)).toEqual([
      'sub_b',
      'sub_a',
    ]);
  });

  it('breaks complete ties by lexicographically smallest subscription id', () => {
    const sorted = [
      createSubscriptionWriteCandidate({
        subscriptionIdentity: 'sub_z',
        status: 'active',
        currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
      }),
      createSubscriptionWriteCandidate({
        subscriptionIdentity: 'sub_a',
        status: 'active',
        currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ].sort(compareCanonicalSubscriptionCandidates);

    expect(sorted.map((item) => item.subscriptionIdentity)).toEqual([
      'sub_a',
      'sub_z',
    ]);
  });

  // Stripe identities mix cases. The locale's order, not code units, decides
  // them: code units would put every capital before every small letter.
  it('orders mixed-case identities by the locale before code units', () => {
    const lower = createSubscriptionWriteCandidate({
      subscriptionIdentity: 'sub_a',
      status: 'active',
      currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
    });
    const upper = createSubscriptionWriteCandidate({
      subscriptionIdentity: 'sub_B',
      status: 'active',
      currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
    });

    expect(compareCanonicalSubscriptionCandidates(lower, upper)).toBeLessThan(
      0,
    );
    expect(
      compareCanonicalSubscriptionCandidates(upper, lower),
    ).toBeGreaterThan(0);
  });

  // #1160 review: localeCompare treats the NFC and NFD spellings of the same
  // text as equal, so distinct identities could tie. A total order keeps
  // canonical selection deterministic and makes "equal" mean "identical".
  it('orders distinct identities that compare equal under the locale', () => {
    const composed = createSubscriptionWriteCandidate({
      subscriptionIdentity: 'sub_\u00e9',
      status: 'active',
      currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
    });
    const decomposed = createSubscriptionWriteCandidate({
      subscriptionIdentity: 'sub_e\u0301',
      status: 'active',
      currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
    });

    expect(compareCanonicalSubscriptionCandidates(decomposed, composed)).toBe(
      -1,
    );
    expect(compareCanonicalSubscriptionCandidates(composed, decomposed)).toBe(
      1,
    );
    expect(compareCanonicalSubscriptionCandidates(composed, composed)).toBe(0);
  });
});
