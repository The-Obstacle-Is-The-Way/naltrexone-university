import { describe, expect, it } from 'vitest';
import {
  ApplicationError,
  ApplicationErrorCodes,
  isApplicationError,
} from './application-errors';

describe('ApplicationErrorCodes', () => {
  it('includes INVALID_WEBHOOK_SIGNATURE', () => {
    expect(ApplicationErrorCodes).toContain('INVALID_WEBHOOK_SIGNATURE');
  });

  it('includes INVALID_WEBHOOK_PAYLOAD', () => {
    expect(ApplicationErrorCodes).toContain('INVALID_WEBHOOK_PAYLOAD');
  });

  it('includes RATE_LIMITED', () => {
    expect(ApplicationErrorCodes).toContain('RATE_LIMITED');
  });
});

describe('ApplicationError', () => {
  it('captures code and message', () => {
    const error = new ApplicationError('NOT_FOUND', 'Question not found');

    expect(error.name).toBe('ApplicationError');
    expect(error._tag).toBe('ApplicationError');
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('Question not found');
  });

  it('preserves fieldErrors when provided', () => {
    const error = new ApplicationError('VALIDATION_ERROR', 'Invalid input', {
      email: ['Required'],
    });

    expect(error.fieldErrors).toEqual({ email: ['Required'] });
  });
});

describe('isApplicationError', () => {
  it('returns true for ApplicationError instances', () => {
    expect(
      isApplicationError(new ApplicationError('CONFLICT', 'Conflict')),
    ).toBe(true);
  });

  it('returns false for non-ApplicationError values', () => {
    expect(isApplicationError(new Error('nope'))).toBe(false);
  });
});
