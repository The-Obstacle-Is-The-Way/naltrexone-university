import { describe, expect, it } from 'vitest';
import {
  AllSubscriptionStatuses,
  EntitledStatuses,
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

    it('returns false for pastDue', () => {
      expect(isEntitledStatus('pastDue')).toBe(false);
    });

    it('returns false for unpaid', () => {
      expect(isEntitledStatus('unpaid')).toBe(false);
    });
  });

  describe('EntitledStatuses', () => {
    it('contains exactly active and inTrial', () => {
      expect(EntitledStatuses).toEqual(['active', 'inTrial']);
    });
  });
});
