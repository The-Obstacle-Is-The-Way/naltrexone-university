import type { StripeSubscriptionStatus } from '@/db/schema';
import { isValidStripeSubscriptionStatus } from '@/src/adapters/gateways/stripe';

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
  assertNumber: (
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

  function assertNumber(
    value: unknown,
    reason: string,
    context: Record<string, unknown>,
  ): asserts value is number {
    if (typeof value !== 'number') {
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
    assertNumber,
    assertBoolean,
    assertStripeSubscriptionStatus,
  };
}
