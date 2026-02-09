import { describe, expect, it } from 'vitest';
import { createCheckoutSuccessAssertions } from './checkout-success-assertions';

describe('checkout success assertions', () => {
  it('assertNotNull rejects null values', () => {
    const assertions = createCheckoutSuccessAssertions((reason) => {
      throw new Error(reason);
    });

    expect(() =>
      assertions.assertNotNull(null, 'Expected non-null', {}),
    ).toThrow('Expected non-null');
  });

  it('assertNotNull accepts non-null values', () => {
    const assertions = createCheckoutSuccessAssertions((reason) => {
      throw new Error(reason);
    });

    expect(() =>
      assertions.assertNotNull('value', 'Expected non-null', {}),
    ).not.toThrow();
  });

  it('assertNonEmptyString rejects empty strings', () => {
    const assertions = createCheckoutSuccessAssertions((reason) => {
      throw new Error(reason);
    });

    expect(() =>
      assertions.assertNonEmptyString('', 'Expected non-empty string', {}),
    ).toThrow('Expected non-empty string');
  });

  it('assertNonEmptyString rejects non-string values', () => {
    const assertions = createCheckoutSuccessAssertions((reason) => {
      throw new Error(reason);
    });

    expect(() =>
      assertions.assertNonEmptyString(123, 'Expected non-empty string', {}),
    ).toThrow('Expected non-empty string');
  });

  it('assertNonEmptyString accepts non-empty strings', () => {
    const assertions = createCheckoutSuccessAssertions((reason) => {
      throw new Error(reason);
    });

    expect(() =>
      assertions.assertNonEmptyString(
        'sub_123',
        'Expected non-empty string',
        {},
      ),
    ).not.toThrow();
  });

  it('assertNumber rejects NaN', () => {
    const assertions = createCheckoutSuccessAssertions((reason) => {
      throw new Error(reason);
    });

    expect(() =>
      assertions.assertNumber(Number.NaN, 'Expected finite number', {}),
    ).toThrow('Expected finite number');
  });

  it('assertNumber rejects Infinity', () => {
    const assertions = createCheckoutSuccessAssertions((reason) => {
      throw new Error(reason);
    });

    expect(() =>
      assertions.assertNumber(
        Number.POSITIVE_INFINITY,
        'Expected finite number',
        {},
      ),
    ).toThrow('Expected finite number');
  });

  it('assertNumber accepts finite numbers', () => {
    const assertions = createCheckoutSuccessAssertions((reason) => {
      throw new Error(reason);
    });

    expect(() =>
      assertions.assertNumber(123, 'Expected finite number', {}),
    ).not.toThrow();
  });

  it('assertBoolean rejects non-boolean values', () => {
    const assertions = createCheckoutSuccessAssertions((reason) => {
      throw new Error(reason);
    });

    expect(() =>
      assertions.assertBoolean('true', 'Expected boolean', {}),
    ).toThrow('Expected boolean');
  });

  it('assertBoolean accepts boolean values', () => {
    const assertions = createCheckoutSuccessAssertions((reason) => {
      throw new Error(reason);
    });

    expect(() =>
      assertions.assertBoolean(true, 'Expected boolean', {}),
    ).not.toThrow();
    expect(() =>
      assertions.assertBoolean(false, 'Expected boolean', {}),
    ).not.toThrow();
  });

  it('assertStripeSubscriptionStatus rejects invalid status strings', () => {
    const assertions = createCheckoutSuccessAssertions((reason) => {
      throw new Error(reason);
    });

    expect(() =>
      assertions.assertStripeSubscriptionStatus(
        'not_a_status',
        'Expected Stripe subscription status',
        {},
      ),
    ).toThrow('Expected Stripe subscription status');
  });

  it('assertStripeSubscriptionStatus accepts known Stripe subscription statuses', () => {
    const assertions = createCheckoutSuccessAssertions((reason) => {
      throw new Error(reason);
    });

    expect(() =>
      assertions.assertStripeSubscriptionStatus(
        'active',
        'Expected Stripe subscription status',
        {},
      ),
    ).not.toThrow();
  });
});
