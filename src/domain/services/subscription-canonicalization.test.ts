import { describe, expect, it } from 'vitest';
import {
  compareCanonicalSubscriptionCandidates,
  subscriptionEntitlementTier,
} from './subscription-canonicalization';

function candidate(overrides: {
  subscriptionIdentity: string;
  status: Parameters<typeof subscriptionEntitlementTier>[0];
  currentPeriodEnd: Date;
}) {
  return overrides;
}

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
      candidate({
        subscriptionIdentity: 'sub_unpaid',
        status: 'unpaid',
        currentPeriodEnd: new Date('2026-08-01T00:00:00.000Z'),
      }),
      candidate({
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
      candidate({
        subscriptionIdentity: 'sub_a',
        status: 'active',
        currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
      }),
      candidate({
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
      candidate({
        subscriptionIdentity: 'sub_z',
        status: 'active',
        currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
      }),
      candidate({
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
});
