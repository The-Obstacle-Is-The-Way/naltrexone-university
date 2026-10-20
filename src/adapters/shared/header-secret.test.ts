import { describe, expect, it } from 'vitest';
import { validateHeaderSecret } from './header-secret';

describe('validateHeaderSecret', () => {
  it('accepts a non-empty header-safe value without exposing it', () => {
    const result = validateHeaderSecret('CRON_SECRET', 'a'.repeat(64));

    expect(result).toEqual({
      name: 'CRON_SECRET',
      present: true,
      ok: true,
      length: 64,
      trimDelta: 0,
      leadingWhitespace: false,
      trailingWhitespace: false,
      internalWhitespace: false,
      headerUnsafe: false,
      errors: [],
    });
  });

  it('rejects leading and trailing whitespace without printing the value', () => {
    const result = validateHeaderSecret('CRON_SECRET', ' secret\n');

    expect(result.ok).toBe(false);
    expect(result.length).toBe(8);
    expect(result.trimDelta).toBe(2);
    expect(result.leadingWhitespace).toBe(true);
    expect(result.trailingWhitespace).toBe(true);
    expect(result.headerUnsafe).toBe(true);
    expect(result.errors).toEqual([
      'must not contain leading whitespace',
      'must not contain trailing whitespace',
      'must not contain HTTP-header-unsafe control characters',
    ]);
  });

  it('rejects internal whitespace (a Bearer token cannot contain spaces) without printing the value', () => {
    const result = validateHeaderSecret('CRON_SECRET', 'abc def');

    expect(result.ok).toBe(false);
    expect(result.leadingWhitespace).toBe(false);
    expect(result.trailingWhitespace).toBe(false);
    expect(result.internalWhitespace).toBe(true);
    expect(result.errors).toEqual(['must not contain internal whitespace']);
  });

  it('rejects a value that cannot be encoded in an HTTP header', () => {
    const result = validateHeaderSecret('CRON_SECRET', 'secret\u0100');

    expect(result.ok).toBe(false);
    expect(result.headerUnsafe).toBe(true);
  });

  it('allows an optional missing value and rejects a required missing value', () => {
    expect(
      validateHeaderSecret('CRON_SECRET', undefined, { optional: true }),
    ).toEqual({
      name: 'CRON_SECRET',
      present: false,
      ok: true,
      length: 0,
      trimDelta: 0,
      leadingWhitespace: false,
      trailingWhitespace: false,
      internalWhitespace: false,
      headerUnsafe: false,
      errors: [],
    });

    const required = validateHeaderSecret('CRON_SECRET', undefined);
    expect(required.ok).toBe(false);
    expect(required.errors).toEqual(['is required']);
  });
});
