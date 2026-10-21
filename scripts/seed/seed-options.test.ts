import { describe, expect, it } from 'vitest';
import { parseSeedOptions, parseSeedPlanOnly } from './seed-options';

describe('parseSeedOptions', () => {
  it('leaves the placeholder fixtures out by default', () => {
    expect(parseSeedOptions([], {})).toEqual({ includePlaceholders: false });
  });

  it('includes the placeholder fixtures only when the command line asks', () => {
    expect(parseSeedOptions(['--include-placeholders'], {})).toEqual({
      includePlaceholders: true,
    });
  });

  // BUG-353: the seed once read this variable, so an exported value reached
  // the production seed through its inherited environment.
  it.each(['true', 'false', ''])(
    'refuses a set SEED_INCLUDE_PLACEHOLDERS (%s), which it no longer reads',
    (value) => {
      expect(() =>
        parseSeedOptions([], { SEED_INCLUDE_PLACEHOLDERS: value }),
      ).toThrow(
        'SEED_INCLUDE_PLACEHOLDERS is set, but the seed no longer reads it. Unset it, and pass --include-placeholders where a test database needs the placeholder fixtures.',
      );
    },
  );

  // As the other strict operator parsers do (#1567): pnpm 11 forwards a
  // separator, so the documented command passes the flag directly.
  it('refuses a forwarded -- separator', () => {
    expect(() =>
      parseSeedOptions(['--', '--include-placeholders'], {}),
    ).toThrow('Unknown seed argument: --.');
  });

  it('refuses an argument it does not know', () => {
    expect(() => parseSeedOptions(['--include-placeholder'], {})).toThrow(
      'Unknown seed argument: --include-placeholder. The only option is --include-placeholders.',
    );
  });
});

describe('parseSeedPlanOnly', () => {
  const usage = 'Usage: pnpm db:seed:prod [--plan]';

  it.each([
    [[], false],
    [['--plan'], true],
  ])('reads %j as plan-only: %s', (args, planOnly) => {
    expect(parseSeedPlanOnly(args, usage)).toBe(planOnly);
  });

  it.each([
    [['--']],
    [['--', '--plan']],
    [['--', '--unsupported']],
    [['--plan', '--plan']],
    [['--plan', '--']],
  ])('refuses %j with the command usage', (args) => {
    expect(() => parseSeedPlanOnly(args, usage)).toThrow(usage);
  });
});
