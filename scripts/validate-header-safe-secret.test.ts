import { describe, expect, it } from 'vitest';
import {
  formatHeaderSecretValidation,
  runValidateHeaderSafeSecret,
  validateHeaderSecret,
} from './validate-header-safe-secret';

function makeSink() {
  const lines: string[] = [];
  return {
    write: (chunk: string) => {
      lines.push(chunk);
      return true;
    },
    text: () => lines.join(''),
  };
}

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
    expect(formatHeaderSecretValidation(result)).toBe(
      'CRON_SECRET: PASS present=true length=64 trim_delta=0 leading_ws=false trailing_ws=false internal_ws=false header_unsafe=false',
    );
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
    expect(formatHeaderSecretValidation(result)).not.toContain('secret');
  });

  it('rejects internal whitespace (a Bearer token cannot contain spaces) without printing the value', () => {
    const result = validateHeaderSecret('CRON_SECRET', 'abc def');

    expect(result.ok).toBe(false);
    expect(result.leadingWhitespace).toBe(false);
    expect(result.trailingWhitespace).toBe(false);
    expect(result.internalWhitespace).toBe(true);
    expect(result.errors).toEqual(['must not contain internal whitespace']);
    expect(formatHeaderSecretValidation(result)).not.toContain('abc def');
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

describe('runValidateHeaderSafeSecret', () => {
  it('prints usage and returns 1 when no secret names are given', () => {
    const out = makeSink();
    const err = makeSink();

    const code = runValidateHeaderSafeSecret([], {}, out, err);

    expect(code).toBe(1);
    expect(err.text()).toContain('Usage:');
    expect(out.text()).toBe('');
  });

  it('returns 0 and reports PASS on stdout for a clean secret without printing it', () => {
    const out = makeSink();
    const err = makeSink();
    const value = 'a'.repeat(64);

    const code = runValidateHeaderSafeSecret(
      ['CRON_SECRET'],
      { CRON_SECRET: value },
      out,
      err,
    );

    expect(code).toBe(0);
    expect(out.text()).toContain('CRON_SECRET: PASS');
    expect(out.text()).not.toContain(value);
    expect(err.text()).toBe('');
  });

  it('returns 1 and reports FAIL on stderr for a whitespace-tainted secret', () => {
    const out = makeSink();
    const err = makeSink();

    const code = runValidateHeaderSafeSecret(
      ['CRON_SECRET'],
      { CRON_SECRET: 'tainted ' },
      out,
      err,
    );

    expect(code).toBe(1);
    expect(err.text()).toContain('CRON_SECRET: FAIL');
    expect(err.text()).toContain('trailing whitespace');
    expect(err.text()).not.toContain('tainted');
  });

  it('treats a missing value as PASS when --optional is set', () => {
    const out = makeSink();
    const err = makeSink();

    const code = runValidateHeaderSafeSecret(
      ['CRON_SECRET', '--optional'],
      {},
      out,
      err,
    );

    expect(code).toBe(0);
    expect(out.text()).toContain('CRON_SECRET: PASS present=false');
  });

  it('returns 1 when any of several secrets is invalid', () => {
    const out = makeSink();
    const err = makeSink();

    const code = runValidateHeaderSafeSecret(
      ['CLEAN_SECRET', 'BROKEN_SECRET'],
      { CLEAN_SECRET: 'clean-value', BROKEN_SECRET: 'broken\n' },
      out,
      err,
    );

    expect(code).toBe(1);
    expect(out.text()).toContain('CLEAN_SECRET: PASS');
    expect(err.text()).toContain('BROKEN_SECRET: FAIL');
  });
});
