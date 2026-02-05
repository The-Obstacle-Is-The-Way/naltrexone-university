import { describe, expect, it } from 'vitest';
import {
  isValidStripeSubscriptionStatus,
  stripeSubscriptionStatusToSubscriptionStatus,
  subscriptionStatusToStripeSubscriptionStatus,
} from './stripe-subscription-status';

describe('isValidStripeSubscriptionStatus', () => {
  it('returns true when value is a known Stripe subscription status', () => {
    expect(isValidStripeSubscriptionStatus('active')).toBe(true);
    expect(isValidStripeSubscriptionStatus('incomplete')).toBe(true);
    expect(isValidStripeSubscriptionStatus('past_due')).toBe(true);
  });

  it('returns false when value is not a known Stripe subscription status', () => {
    expect(isValidStripeSubscriptionStatus('pastDue')).toBe(false);
    expect(isValidStripeSubscriptionStatus('unknown')).toBe(false);
  });
});

describe('stripeSubscriptionStatusToSubscriptionStatus', () => {
  it('returns paymentProcessing when Stripe status is incomplete', () => {
    expect(stripeSubscriptionStatusToSubscriptionStatus('incomplete')).toBe(
      'paymentProcessing',
    );
  });

  it('returns pastDue when Stripe status is past_due', () => {
    expect(stripeSubscriptionStatusToSubscriptionStatus('past_due')).toBe(
      'pastDue',
    );
  });
});

describe('subscriptionStatusToStripeSubscriptionStatus', () => {
  it('returns trialing when SubscriptionStatus is inTrial', () => {
    expect(subscriptionStatusToStripeSubscriptionStatus('inTrial')).toBe(
      'trialing',
    );
  });
});
