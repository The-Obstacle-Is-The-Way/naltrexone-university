import { describe, expect, it } from 'vitest';
import {
  getStripePriceId,
  getSubscriptionPlanFromPriceId,
  type StripePriceIds,
} from './stripe-prices';

const testPriceIds: StripePriceIds = {
  monthly: 'price_monthly_123',
  annual: 'price_annual_456',
};

describe('stripe-prices config', () => {
  describe('getStripePriceId', () => {
    it('returns monthly price ID for monthly plan', () => {
      const priceId = getStripePriceId('monthly', testPriceIds);
      expect(priceId).toBe('price_monthly_123');
    });

    it('returns annual price ID for annual plan', () => {
      const priceId = getStripePriceId('annual', testPriceIds);
      expect(priceId).toBe('price_annual_456');
    });
  });

  describe('getSubscriptionPlanFromPriceId', () => {
    it('returns monthly for monthly price ID', () => {
      const plan = getSubscriptionPlanFromPriceId(
        'price_monthly_123',
        testPriceIds,
      );
      expect(plan).toBe('monthly');
    });

    it('returns annual for annual price ID', () => {
      const plan = getSubscriptionPlanFromPriceId(
        'price_annual_456',
        testPriceIds,
      );
      expect(plan).toBe('annual');
    });

    it('returns null for unknown price ID', () => {
      const plan = getSubscriptionPlanFromPriceId(
        'price_unknown_789',
        testPriceIds,
      );
      expect(plan).toBeNull();
    });

    it('returns null for empty price ID', () => {
      const plan = getSubscriptionPlanFromPriceId('', testPriceIds);
      expect(plan).toBeNull();
    });
  });

  describe('bidirectional mapping', () => {
    it('round-trips monthly plan correctly', () => {
      const priceId = getStripePriceId('monthly', testPriceIds);
      const plan = getSubscriptionPlanFromPriceId(priceId, testPriceIds);
      expect(plan).toBe('monthly');
    });

    it('round-trips annual plan correctly', () => {
      const priceId = getStripePriceId('annual', testPriceIds);
      const plan = getSubscriptionPlanFromPriceId(priceId, testPriceIds);
      expect(plan).toBe('annual');
    });
  });
});
