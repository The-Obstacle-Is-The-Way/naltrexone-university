import { describe, expect, it } from 'vitest';
import { DomainError, isDomainError } from './domain-errors';

describe('DomainError', () => {
  it('captures code and message', () => {
    const error = new DomainError('INVALID_ATTEMPT', 'Invalid attempt');

    expect(error.name).toBe('DomainError');
    expect(error._tag).toBe('DomainError');
    expect(error.code).toBe('INVALID_ATTEMPT');
    expect(error.message).toBe('Invalid attempt');
  });
});

describe('isDomainError', () => {
  it('returns true for DomainError instances', () => {
    expect(isDomainError(new DomainError('INVALID_CHOICE', 'Invalid'))).toBe(
      true,
    );
  });

  it('returns false for non-DomainError values', () => {
    expect(isDomainError(new Error('nope'))).toBe(false);
  });
});
