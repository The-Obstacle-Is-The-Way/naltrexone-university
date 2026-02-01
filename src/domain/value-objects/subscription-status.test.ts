import { describe, expect, it } from 'vitest';
import {
  AllSubscriptionStatuses,
  EntitledStatuses,
  isEntitledStatus,
  isValidSubscriptionStatus,
} from './subscription-status';

describe('SubscriptionStatus', () => {
  it('contains all 8 Stripe subscription statuses', () => {
    expect(AllSubscriptionStatuses).toEqual([
      'incomplete',
      'incomplete_expired',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'unpaid',
      'paused',
    ]);
  });

  describe('isValidSubscriptionStatus', () => {
    it('returns true for known statuses', () => {
      expect(isValidSubscriptionStatus('active')).toBe(true);
      expect(isValidSubscriptionStatus('trialing')).toBe(true);
      expect(isValidSubscriptionStatus('canceled')).toBe(true);
    });

    it('returns false for unknown status', () => {
      expect(isValidSubscriptionStatus('expired')).toBe(false);
    });
  });

  describe('isEntitledStatus', () => {
    it('returns true for active', () => {
      expect(isEntitledStatus('active')).toBe(true);
    });

    it('returns true for trialing', () => {
      expect(isEntitledStatus('trialing')).toBe(true);
    });

    it('returns false for canceled', () => {
      expect(isEntitledStatus('canceled')).toBe(false);
    });

    it('returns false for past_due', () => {
      expect(isEntitledStatus('past_due')).toBe(false);
    });

    it('returns false for unpaid', () => {
      expect(isEntitledStatus('unpaid')).toBe(false);
    });
  });

  describe('EntitledStatuses', () => {
    it('contains exactly active and trialing', () => {
      expect(EntitledStatuses).toEqual(['active', 'trialing']);
    });
  });
});
