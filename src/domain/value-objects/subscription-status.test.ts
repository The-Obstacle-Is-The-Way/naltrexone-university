import { describe, expect, it } from 'vitest';
import {
  AllSubscriptionStatuses,
  EntitledStatuses,
  isBlockingCheckoutSubscriptionStatus,
  isEntitledStatus,
  isValidSubscriptionStatus,
} from './subscription-status';

describe('SubscriptionStatus', () => {
  it('contains all known subscription statuses', () => {
    expect(AllSubscriptionStatuses).toEqual([
      'paymentProcessing',
      'paymentFailed',
      'inTrial',
      'active',
      'canceled',
      'unpaid',
      'paused',
      'pastDue',
    ]);
  });

  describe('isValidSubscriptionStatus', () => {
    it('returns true for known statuses', () => {
      expect(isValidSubscriptionStatus('active')).toBe(true);
      expect(isValidSubscriptionStatus('inTrial')).toBe(true);
      expect(isValidSubscriptionStatus('canceled')).toBe(true);
      expect(isValidSubscriptionStatus('paymentProcessing')).toBe(true);
    });

    it('returns false for unknown status', () => {
      expect(isValidSubscriptionStatus('expired')).toBe(false);
    });
  });

  describe('isEntitledStatus', () => {
    it('returns true for active', () => {
      expect(isEntitledStatus('active')).toBe(true);
    });

    it('returns true for inTrial', () => {
      expect(isEntitledStatus('inTrial')).toBe(true);
    });

    it('returns false for canceled', () => {
      expect(isEntitledStatus('canceled')).toBe(false);
    });

    it('returns true for pastDue', () => {
      expect(isEntitledStatus('pastDue')).toBe(true);
    });

    it('returns false for unpaid', () => {
      expect(isEntitledStatus('unpaid')).toBe(false);
    });
  });

  describe('EntitledStatuses', () => {
    it('contains exactly active, inTrial, and pastDue', () => {
      expect(EntitledStatuses).toEqual(['active', 'inTrial', 'pastDue']);
    });
  });

  describe('isBlockingCheckoutSubscriptionStatus', () => {
    it('returns true for active and recoverable statuses', () => {
      expect(isBlockingCheckoutSubscriptionStatus('active')).toBe(true);
      expect(isBlockingCheckoutSubscriptionStatus('inTrial')).toBe(true);
      expect(isBlockingCheckoutSubscriptionStatus('pastDue')).toBe(true);
      expect(isBlockingCheckoutSubscriptionStatus('unpaid')).toBe(true);
      expect(isBlockingCheckoutSubscriptionStatus('paymentProcessing')).toBe(
        true,
      );
      expect(isBlockingCheckoutSubscriptionStatus('paused')).toBe(true);
    });

    it('returns false for terminal statuses', () => {
      expect(isBlockingCheckoutSubscriptionStatus('canceled')).toBe(false);
      expect(isBlockingCheckoutSubscriptionStatus('paymentFailed')).toBe(false);
    });
  });
});
