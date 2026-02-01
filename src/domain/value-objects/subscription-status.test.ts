import { describe, expect, it } from 'vitest';
import {
  AllSubscriptionStatuses,
  EntitledStatuses,
  isEntitledStatus,
} from './subscription-status';

describe('SubscriptionStatus', () => {
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

  describe('AllSubscriptionStatuses', () => {
    it('contains all 8 Stripe statuses', () => {
      expect(AllSubscriptionStatuses).toHaveLength(8);
    });
  });
});
