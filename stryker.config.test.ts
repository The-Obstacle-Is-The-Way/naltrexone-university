import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const { mutate }: { mutate: string[] } = JSON.parse(
  readFileSync('stryker.config.json', 'utf8'),
);

describe('stryker.config.json', () => {
  // Stryker warns "did not exclude any files" for a negated pattern that
  // matches nothing, on every weekly run, where nobody reads it.
  it('excludes, with each negated pattern, a file it would otherwise mutate', () => {
    const mutated = new Set(
      mutate
        .filter((pattern) => !pattern.startsWith('!'))
        .flatMap((pattern) => globSync(pattern)),
    );

    expect(
      mutate
        .filter((pattern) => pattern.startsWith('!'))
        .filter(
          (pattern) =>
            !globSync(pattern.slice(1)).some((file) => mutated.has(file)),
        ),
    ).toEqual([]);
  });
});
