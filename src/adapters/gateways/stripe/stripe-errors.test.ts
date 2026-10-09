import { describe, expect, it } from 'vitest';
import { isAlreadyCanceledError, isStripeOutage } from './stripe-errors';

describe('isAlreadyCanceledError', () => {
  it('returns true for resource_missing with invalid_request_error', () => {
    const error = Object.assign(new Error('No such subscription: sub_123'), {
      rawType: 'invalid_request_error',
      code: 'resource_missing',
    });
    expect(isAlreadyCanceledError(error)).toBe(true);
  });

  it('returns true when message contains "already canceled"', () => {
    const error = Object.assign(
      new Error('This subscription has already canceled'),
      {
        rawType: 'invalid_request_error',
        code: 'some_other_code',
      },
    );
    expect(isAlreadyCanceledError(error)).toBe(true);
  });

  it('returns true when message contains "no such subscription"', () => {
    const error = Object.assign(new Error('No such subscription'), {
      rawType: 'invalid_request_error',
      code: 'some_other_code',
    });
    expect(isAlreadyCanceledError(error)).toBe(true);
  });

  it('returns false for non-invalid_request_error rawType', () => {
    const error = Object.assign(new Error('Invalid API Key provided'), {
      rawType: 'authentication_error',
      code: 'resource_missing',
    });
    expect(isAlreadyCanceledError(error)).toBe(false);
  });

  it('returns false for invalid_request_error with unrelated code and message', () => {
    const error = Object.assign(new Error('Invalid parameter: price'), {
      rawType: 'invalid_request_error',
      code: 'parameter_invalid',
    });
    expect(isAlreadyCanceledError(error)).toBe(false);
  });

  it('returns false for non-object errors', () => {
    expect(isAlreadyCanceledError('string error')).toBe(false);
    expect(isAlreadyCanceledError(null)).toBe(false);
    expect(isAlreadyCanceledError(undefined)).toBe(false);
  });
});

// DEBT-501 item 6: shaped as stripe-node 22 raises them (Error.js,
// RequestSender.js): each carries its class name as `type`.
function stripeError(type: string, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(type), { type, ...extra });
}

describe('isStripeOutage', () => {
  it.each([
    [
      'a network error',
      Object.assign(new Error('reset'), { code: 'ECONNRESET' }),
    ],
    ['a 5xx', stripeError('StripeAPIError', { statusCode: 503 })],
    ['a 429', stripeError('StripeRateLimitError', { statusCode: 429 })],
    [
      'a lost connection, with no code or status',
      stripeError('StripeConnectionError'),
    ],
    // A 5xx whose body is not JSON, or a body cut off mid-stream.
    ['an API error with no status', stripeError('StripeAPIError')],
    // Stripe can answer a rate limit as a 400 with code rate_limit.
    [
      'a rate limit sent as a 400',
      stripeError('StripeRateLimitError', {
        statusCode: 400,
        code: 'rate_limit',
      }),
    ],
  ])('counts %s', (_case, error) => {
    expect(isStripeOutage(error)).toBe(true);
  });

  it.each([
    [
      'an invalid request',
      stripeError('StripeInvalidRequestError', { statusCode: 400 }),
    ],
    ['a declined card', stripeError('StripeCardError', { statusCode: 402 })],
    ['a conflict', stripeError('StripeIdempotencyError', { statusCode: 400 })],
    [
      'a missing resource',
      stripeError('StripeInvalidRequestError', { statusCode: 404 }),
    ],
  ])('does not count %s, which is Stripe answering', (_case, error) => {
    expect(isStripeOutage(error)).toBe(false);
  });
});
