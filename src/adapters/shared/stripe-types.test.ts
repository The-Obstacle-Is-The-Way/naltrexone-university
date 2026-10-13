import type Stripe from 'stripe';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  type BillingPortalConfigurationCreateParams,
  type BillingPortalConfigurationListParams,
  type BillingPortalSessionCreateParams,
  type CheckoutSessionCreateParams,
  type CustomerCreateParams,
  type CustomerSearchParams,
  STRIPE_SUBSCRIPTION_STATUSES,
  type StripeCheckoutSession,
  type StripeCheckoutSessionListParams,
  type StripeCheckoutSessionMode,
  type StripeCheckoutSessionPaymentMethodCollection,
  type StripeCheckoutSessionResponseStatus,
  type StripeCheckoutSessionStatus,
  type StripeClient,
  type StripeSubscriptionListParams,
  type StripeSubscriptionResponseStatus,
  type StripeSubscriptionStatus,
} from './stripe-types';

type OtherString = string & Record<never, never>;

// Stripe's types allow `Emptyable` request fields ('' clears a value).
type Present<T> = Exclude<T, undefined | null | ''>;
type Element<T> = T extends ReadonlyArray<infer Item> ? Item : T;

// The dotted paths of request fields the port can send that the installed
// SDK's request type lacks, or never when the SDK knows every one.
type UnknownRequestFieldPaths<
  Port,
  Sdk,
  Prefix extends string = '',
> = Port extends unknown
  ? {
      [Key in keyof Port & string]-?: Key extends keyof Present<Sdk>
        ? Element<Present<Port[Key]>> extends object
          ? UnknownRequestFieldPaths<
              Element<Present<Port[Key]>>,
              Element<Present<Present<Sdk>[Key]>>,
              `${Prefix}${Key}.`
            >
          : never
        : `${Prefix}${Key}`;
    }[keyof Port & string]
  : never;

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

  it('sends only request fields the pinned API version accepts', () => {
    // A major API release can remove a request field; Endive removed Checkout
    // Session's `payment_method_types`, which Stripe then answers with a 400.
    // The SDK release that pins the version drops the field from its request
    // types, so this check names any field the port still sends.
    expectTypeOf<
      UnknownRequestFieldPaths<
        CheckoutSessionCreateParams,
        Stripe.Checkout.SessionCreateParams
      >
    >().toEqualTypeOf<never>();
    expectTypeOf<
      UnknownRequestFieldPaths<
        StripeCheckoutSessionListParams,
        Stripe.Checkout.SessionListParams
      >
    >().toEqualTypeOf<never>();
    expectTypeOf<
      UnknownRequestFieldPaths<
        CustomerCreateParams,
        Stripe.CustomerCreateParams
      >
    >().toEqualTypeOf<never>();
    expectTypeOf<
      UnknownRequestFieldPaths<
        CustomerSearchParams,
        Stripe.CustomerSearchParams
      >
    >().toEqualTypeOf<never>();
    expectTypeOf<
      UnknownRequestFieldPaths<
        StripeSubscriptionListParams,
        Stripe.SubscriptionListParams
      >
    >().toEqualTypeOf<never>();
    expectTypeOf<
      UnknownRequestFieldPaths<
        Parameters<StripeClient['subscriptions']['update']>[1],
        Stripe.SubscriptionUpdateParams
      >
    >().toEqualTypeOf<never>();
    expectTypeOf<
      UnknownRequestFieldPaths<
        Parameters<StripeClient['paymentMethods']['attach']>[1],
        Stripe.PaymentMethodAttachParams
      >
    >().toEqualTypeOf<never>();
    expectTypeOf<
      UnknownRequestFieldPaths<
        BillingPortalSessionCreateParams,
        Stripe.BillingPortal.SessionCreateParams
      >
    >().toEqualTypeOf<never>();
    expectTypeOf<
      UnknownRequestFieldPaths<
        BillingPortalConfigurationCreateParams,
        Stripe.BillingPortal.ConfigurationCreateParams
      >
    >().toEqualTypeOf<never>();
    expectTypeOf<
      UnknownRequestFieldPaths<
        BillingPortalConfigurationListParams,
        Stripe.BillingPortal.ConfigurationListParams
      >
    >().toEqualTypeOf<never>();
  });
});
