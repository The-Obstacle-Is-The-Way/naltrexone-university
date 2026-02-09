import { describe, expect, it } from 'vitest';
import { createCheckoutSuccessAssertions } from './checkout-success-assertions';

describe('checkout success assertions', () => {
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
});
