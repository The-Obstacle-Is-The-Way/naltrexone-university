import { describe, expect, it } from 'vitest';
import { parseSeedOptions } from './seed-options';

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
  it.each(['true', 'false'])(
    'refuses a set SEED_INCLUDE_PLACEHOLDERS (%s), which it no longer reads',
    (value) => {
      expect(() =>
        parseSeedOptions([], { SEED_INCLUDE_PLACEHOLDERS: value }),
      ).toThrow(
        'SEED_INCLUDE_PLACEHOLDERS is set, but the seed no longer reads it. Unset it, and pass --include-placeholders where a test database needs the placeholder fixtures.',
      );
    },
  );

  it('refuses an argument it does not know', () => {
    expect(() => parseSeedOptions(['--include-placeholder'], {})).toThrow(
      'Unknown seed argument: --include-placeholder. The only option is --include-placeholders.',
    );
  });
});
