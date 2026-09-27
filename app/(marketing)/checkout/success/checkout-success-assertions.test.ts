import { describe, expect, it } from 'vitest';
import {
  STRIPE_SUBSCRIPTION_STATUSES,
  type StripeSubscriptionStatus,
} from '@/src/adapters/shared/stripe-types';
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

  // #1167 review: a Stripe timestamp must convert to a valid Date.
  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['a value past the Date range', 8_640_000_000_001],
    ['a fraction', 1_696_000_000.5],
    ['a negative value', -1],
    ['a string', '1696000000'],
  ])('assertStripeTimestamp rejects %s', (_label, value) => {
    const assertions = createCheckoutSuccessAssertions((reason) => {
      throw new Error(reason);
    });

    expect(() =>
      assertions.assertStripeTimestamp(value, 'Expected timestamp', {}),
    ).toThrow('Expected timestamp');
  });

  it.each([0, 1_696_000_000, 8_640_000_000_000])(
    'assertStripeTimestamp accepts %s',
    (value) => {
      const assertions = createCheckoutSuccessAssertions((reason) => {
        throw new Error(reason);
      });

      expect(() =>
        assertions.assertStripeTimestamp(value, 'Expected timestamp', {}),
      ).not.toThrow();
    },
  );

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

  it('assertStripeSubscriptionStatus accepts adapter-owned Stripe subscription statuses', () => {
    const assertions = createCheckoutSuccessAssertions((reason) => {
      throw new Error(reason);
    });

    const acceptAdapterOwnedStatus = (status: StripeSubscriptionStatus) => {
      expect(() =>
        assertions.assertStripeSubscriptionStatus(
          status,
          'Expected Stripe subscription status',
          {},
        ),
      ).not.toThrow();
    };

    for (const status of STRIPE_SUBSCRIPTION_STATUSES) {
      acceptAdapterOwnedStatus(status);
    }
  });
});
