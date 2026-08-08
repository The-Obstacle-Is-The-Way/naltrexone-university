import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  STRIPE_SUBSCRIPTION_STATUSES,
  type StripeCheckoutSessionMode,
  type StripeCheckoutSessionPaymentMethodCollection,
  type StripeSubscriptionResponseStatus,
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

describe('Stripe response enums', () => {
  type OtherString = string & Record<never, never>;

  it('preserves known checkout values while allowing future values', () => {
    expectTypeOf<StripeCheckoutSessionMode>().toEqualTypeOf<
      'payment' | 'setup' | 'subscription' | OtherString
    >();
    expectTypeOf<StripeCheckoutSessionPaymentMethodCollection>().toEqualTypeOf<
      'always' | 'if_required' | OtherString
    >();
  });

  it('preserves known subscription statuses while allowing future values', () => {
    expectTypeOf<StripeSubscriptionResponseStatus>().toEqualTypeOf<
      StripeSubscriptionStatus | OtherString
    >();
  });
});
