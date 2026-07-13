import { describe, expect, it } from 'vitest';
import { isRollbackCertainPersistenceError } from '@/src/application/errors';
import {
  getPostgresConstraintName,
  getPostgresErrorCode,
  isPostgresUniqueViolation,
  toRollbackCertainPersistenceError,
} from './postgres-errors';

describe('postgres-errors', () => {
  it('extracts code from top-level error objects', () => {
    expect(getPostgresErrorCode({ code: '23505' })).toBe('23505');
    expect(getPostgresConstraintName({ constraint: 'users_email_key' })).toBe(
      'users_email_key',
    );
    expect(isPostgresUniqueViolation({ code: '23505' })).toBe(true);
  });

  it('extracts code from nested cause objects', () => {
    expect(getPostgresErrorCode({ cause: { code: '23505' } })).toBe('23505');
    expect(
      getPostgresConstraintName({ cause: { constraint: 'users_email_key' } }),
    ).toBe('users_email_key');
    expect(isPostgresUniqueViolation({ cause: { code: '23505' } })).toBe(true);
  });

  it('returns null/false when code is missing', () => {
    expect(getPostgresErrorCode(new Error('boom'))).toBeNull();
    expect(getPostgresConstraintName(new Error('boom'))).toBeNull();
    expect(isPostgresUniqueViolation(new Error('boom'))).toBe(false);
  });

  it('returns null when error shape is not a postgres error', () => {
    expect(getPostgresErrorCode(null)).toBeNull();
    expect(getPostgresErrorCode(undefined)).toBeNull();
    expect(getPostgresErrorCode('string')).toBeNull();
    expect(getPostgresErrorCode({ code: 123 })).toBeNull();
    expect(getPostgresErrorCode({ cause: { code: 123 } })).toBeNull();

    expect(getPostgresConstraintName(null)).toBeNull();
    expect(getPostgresConstraintName(undefined)).toBeNull();
    expect(getPostgresConstraintName('string')).toBeNull();
    expect(getPostgresConstraintName({ constraint: 123 })).toBeNull();
    expect(
      getPostgresConstraintName({ cause: { constraint: 123 } }),
    ).toBeNull();
    expect(getPostgresConstraintName({ cause: null })).toBeNull();
  });

  it('returns false for other Postgres error codes', () => {
    expect(isPostgresUniqueViolation({ code: '23503' })).toBe(false);
  });

  it('classifies query cancellation only with transaction-body proof', () => {
    const cancellation = { code: '57014' };

    expect(
      toRollbackCertainPersistenceError(cancellation, {
        phase: 'transaction_body',
      }),
    ).toSatisfy(isRollbackCertainPersistenceError);
    expect(
      toRollbackCertainPersistenceError(cancellation, {
        phase: 'transaction_boundary',
      }),
    ).toBeNull();
  });
});
