import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const biome: { files: { includes: string[] } } = JSON.parse(
  readFileSync('biome.json', 'utf8'),
);
const lintStaged: Record<string, string[]> = JSON.parse(
  readFileSync('package.json', 'utf8'),
)['lint-staged'];

describe('lint-staged', () => {
  // The pre-commit hook and CI's Biome run must see the same file types, or a
  // type one of them skips (.mts was skipped by both) is committed unchecked.
  it('checks before each commit every file type Biome includes', () => {
    const biomeExtensions = biome.files.includes
      .filter((pattern) => pattern.startsWith('**/*.'))
      .map((pattern) => pattern.slice('**/*.'.length));
    const stagedExtensions = Object.keys(lintStaged).flatMap((pattern) =>
      (/^\*\.\{(.+)\}$/.exec(pattern)?.[1] ?? '').split(','),
    );

    // Equality alone also passes when both tools skip the plain-node scripts.
    expect(biomeExtensions).toContain('mts');
    expect(stagedExtensions.toSorted()).toEqual(biomeExtensions.toSorted());
  });
});
