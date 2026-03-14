import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  STRIPE_SUBSCRIPTION_STATUSES,
  type StripeSubscriptionStatus,
} from './stripe-types';

describe('StripeSubscriptionStatus', () => {
  it('matches Stripe subscription status values', () => {
    type Expected =
      | 'incomplete'
      | 'incomplete_expired'
      | 'trialing'
      | 'active'
      | 'past_due'
      | 'canceled'
      | 'unpaid'
      | 'paused';

    expectTypeOf<StripeSubscriptionStatus>().toEqualTypeOf<Expected>();
    expectTypeOf<Expected>().toEqualTypeOf<StripeSubscriptionStatus>();
  });

  it('keeps STRIPE_SUBSCRIPTION_STATUSES aligned with the expected values', () => {
    expect(STRIPE_SUBSCRIPTION_STATUSES).toEqual([
      'active',
      'canceled',
      'incomplete',
      'incomplete_expired',
      'past_due',
      'paused',
      'trialing',
      'unpaid',
    ]);
  });
});
