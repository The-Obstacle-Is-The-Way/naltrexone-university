import { describe, expect, it } from 'vitest';
import {
  getPostgresErrorCode,
  isPostgresUniqueViolation,
} from './postgres-errors';

describe('postgres-errors', () => {
  it('extracts code from top-level error objects', () => {
    expect(getPostgresErrorCode({ code: '23505' })).toBe('23505');
    expect(isPostgresUniqueViolation({ code: '23505' })).toBe(true);
  });

  it('extracts code from nested cause objects', () => {
    expect(getPostgresErrorCode({ cause: { code: '23505' } })).toBe('23505');
    expect(isPostgresUniqueViolation({ cause: { code: '23505' } })).toBe(true);
  });

  it('returns null/false when code is missing', () => {
    expect(getPostgresErrorCode(new Error('boom'))).toBeNull();
    expect(isPostgresUniqueViolation(new Error('boom'))).toBe(false);
  });
});
