import { isValidStripeSubscriptionStatus } from '@/src/adapters/gateways/stripe';
import { stripeTimestampSchema } from '@/src/adapters/gateways/stripe/stripe-webhook-schemas';
import type { StripeSubscriptionStatus } from '@/src/adapters/shared/stripe-types';

type AssertionContext = Record<string, unknown>;

export type CheckoutSuccessAssertions = {
  assertNotNull: <T>(
    value: T | null,
    reason: string,
    context: AssertionContext,
  ) => asserts value is T;
  assertNonEmptyString: (
    value: unknown,
    reason: string,
    context: AssertionContext,
  ) => asserts value is string;
  assertStripeTimestamp: (
    value: unknown,
    reason: string,
    context: AssertionContext,
  ) => asserts value is number;
  assertBoolean: (
    value: unknown,
    reason: string,
    context: AssertionContext,
  ) => asserts value is boolean;
  assertStripeSubscriptionStatus: (
    value: string,
    reason: string,
    context: AssertionContext,
  ) => asserts value is StripeSubscriptionStatus;
};

type FailFn = (reason: string, context?: AssertionContext) => never;

export function createCheckoutSuccessAssertions(
  fail: FailFn,
): CheckoutSuccessAssertions {
  function assertNotNull<T>(
    value: T | null,
    reason: string,
    context: Record<string, unknown>,
  ): asserts value is T {
    if (value === null) {
      fail(reason, context);
    }
  }

  function assertNonEmptyString(
    value: unknown,
    reason: string,
    context: Record<string, unknown>,
  ): asserts value is string {
    if (typeof value !== 'string' || value.length === 0) {
      fail(reason, context);
    }
  }

  // A Stripe timestamp that converts to a valid Date (#1167 review): the
  // same rule the webhook schema applies.
  function assertStripeTimestamp(
    value: unknown,
    reason: string,
    context: Record<string, unknown>,
  ): asserts value is number {
    if (!stripeTimestampSchema.safeParse(value).success) {
      fail(reason, context);
    }
  }

  function assertBoolean(
    value: unknown,
    reason: string,
    context: Record<string, unknown>,
  ): asserts value is boolean {
    if (typeof value !== 'boolean') {
      fail(reason, context);
    }
  }

  function assertStripeSubscriptionStatus(
    value: string,
    reason: string,
    context: Record<string, unknown>,
  ): asserts value is StripeSubscriptionStatus {
    if (!isValidStripeSubscriptionStatus(value)) {
      fail(reason, context);
    }
  }

  return {
    assertNotNull,
    assertNonEmptyString,
    assertStripeTimestamp,
    assertBoolean,
    assertStripeSubscriptionStatus,
  };
}
