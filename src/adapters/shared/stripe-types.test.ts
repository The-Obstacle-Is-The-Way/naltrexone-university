import { describe, expectTypeOf, it } from 'vitest';
import type { StripeSubscriptionStatus } from './stripe-types';

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
});
