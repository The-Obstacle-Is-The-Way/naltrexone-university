import { describe, expect, it } from 'vitest';
import { validateHeaderSecret } from '../../src/adapters/shared/header-secret';
import {
  formatHeaderSecretValidation,
  runValidateHeaderSafeSecret,
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

describe('formatHeaderSecretValidation', () => {
  it('prints only diagnostics for clean and tainted values', () => {
    expect(
      formatHeaderSecretValidation(
        validateHeaderSecret('CRON_SECRET', 'a'.repeat(64)),
      ),
    ).toBe(
      'CRON_SECRET: PASS present=true length=64 trim_delta=0 leading_ws=false trailing_ws=false internal_ws=false header_unsafe=false',
    );
    for (const value of [' secret\n', 'abc def']) {
      expect(
        formatHeaderSecretValidation(
          validateHeaderSecret('CRON_SECRET', value),
        ),
      ).not.toContain(value.trim());
    }
  });
});
