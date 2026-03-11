import { describe, expect, it } from 'vitest';
import { isAlreadyCanceledError } from './stripe-errors';

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
