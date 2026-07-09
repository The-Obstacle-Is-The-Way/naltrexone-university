import { describe, expect, it } from 'vitest';
import {
  ApplicationConflictReasons,
  ApplicationError,
  ApplicationErrorCodes,
  isApplicationConflictReason,
  isApplicationError,
  PracticeSessionConflictReasons,
  practiceSessionAlreadyEndedError,
  practiceSessionStateChangedConcurrentlyError,
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

  it('preserves cause when provided', () => {
    const cause = new Error('db down');
    const error = new ApplicationError('INTERNAL_ERROR', 'Boom', undefined, {
      cause,
    });

    expect((error as Error).cause).toBe(cause);
  });

  it('preserves explicit client-facing details when provided', () => {
    const error = new ApplicationError('CONFLICT', 'Conflict', undefined, {
      details: {
        reason: ApplicationConflictReasons.StateChangedConcurrently,
      },
    });

    expect(error.details).toEqual({
      reason: ApplicationConflictReasons.StateChangedConcurrently,
    });
  });

  it('accepts application-wide conflict reasons including idempotency wait timeouts', () => {
    expect(
      isApplicationConflictReason(
        ApplicationConflictReasons.StateChangedConcurrently,
      ),
    ).toBe(true);
    expect(
      isApplicationConflictReason(
        ApplicationConflictReasons.ConcurrentRequestInProgress,
      ),
    ).toBe(true);
    expect(isApplicationConflictReason('unknown_reason')).toBe(false);
  });

  it('creates a structured already-ended practice-session conflict', () => {
    const error = practiceSessionAlreadyEndedError();

    expect(error).toMatchObject({
      code: 'CONFLICT',
      message: 'Practice session already ended',
      details: {
        reason: PracticeSessionConflictReasons.AlreadyEnded,
      },
    });
  });

  it('creates a structured concurrent practice-session state conflict with an optional cause', () => {
    const cause = new Error('serialization failure');
    const error = practiceSessionStateChangedConcurrentlyError({ cause });

    expect(error).toMatchObject({
      code: 'CONFLICT',
      message: 'Practice session state changed concurrently; please retry.',
      details: {
        reason: PracticeSessionConflictReasons.StateChangedConcurrently,
      },
    });
    expect((error as Error).cause).toBe(cause);
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
