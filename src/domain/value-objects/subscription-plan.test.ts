import { describe, expect, it } from 'vitest';
import {
  AllSubscriptionPlans,
  isValidSubscriptionPlan,
} from './subscription-plan';

describe('SubscriptionPlan', () => {
  it('has monthly and annual plans', () => {
    expect(AllSubscriptionPlans).toEqual(['monthly', 'annual']);
  });

  it('validates known plans', () => {
    expect(isValidSubscriptionPlan('monthly')).toBe(true);
    expect(isValidSubscriptionPlan('annual')).toBe(true);
  });

  it('rejects unknown plans', () => {
    expect(isValidSubscriptionPlan('weekly')).toBe(false);
  });
});
