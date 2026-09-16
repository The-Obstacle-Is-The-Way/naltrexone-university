import type Stripe from 'stripe';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  STRIPE_SUBSCRIPTION_STATUSES,
  type StripeCheckoutSession,
  type StripeCheckoutSessionListParams,
  type StripeCheckoutSessionMode,
  type StripeCheckoutSessionPaymentMethodCollection,
  type StripeCheckoutSessionResponseStatus,
  type StripeCheckoutSessionStatus,
  type StripeClient,
  type StripeSubscriptionResponseStatus,
  type StripeSubscriptionStatus,
} from './stripe-types';

type OtherString = string & Record<never, never>;

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

describe('Stripe checkout session status', () => {
  it('keeps the list filter restricted to known statuses', () => {
    expectTypeOf<StripeCheckoutSessionStatus>().toEqualTypeOf<
      'open' | 'complete' | 'expired'
    >();
    expectTypeOf<StripeCheckoutSessionListParams['status']>().toEqualTypeOf<
      StripeCheckoutSessionStatus | undefined
    >();
  });

  it('preserves known response statuses while allowing future values', () => {
    expectTypeOf<StripeCheckoutSessionResponseStatus>().toEqualTypeOf<
      StripeCheckoutSessionStatus | OtherString
    >();
    expectTypeOf<StripeCheckoutSession['status']>().toEqualTypeOf<
      StripeCheckoutSessionResponseStatus | null | undefined
    >();
  });
});

describe('StripeClient port', () => {
  it('is satisfied by the installed Stripe SDK client', () => {
    // The composition root passes the real SDK instance where the narrow port
    // is expected. Stripe widens response enums between SDK releases, so this
    // is the contract that must fail before a widening reaches production code.
    expectTypeOf<Stripe>().toExtend<StripeClient>();
    expectTypeOf<Stripe.Checkout.Session['status']>().toExtend<
      StripeCheckoutSession['status']
    >();
  });
});
