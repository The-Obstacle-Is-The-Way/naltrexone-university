import fg from 'fast-glob';
import { describe, expect, it } from 'vitest';

// Test support under src/ lives in its layer's test-helpers/ directory, where
// path-scoped rules (.claude/rules/fixture-integrity.md) and tool globs
// (`src/**/test-helpers/**`) find it. app/ and components/ colocate helpers
// beside their suites instead, because every folder under app/ is a route
// segment; see .claude/rules/testing.md, Test Support Locations.
const SRC_TEST_SUPPORT_GLOBS = [
  'src/**/*-test-helpers.ts',
  'src/**/*-test-helpers.tsx',
  'src/**/*.fixtures.ts',
  'src/**/*.probes.tsx',
];

describe('test-support location policy', () => {
  it('keeps src/ test support inside a test-helpers/ directory', () => {
    const outliers = fg
      .sync(SRC_TEST_SUPPORT_GLOBS, { cwd: process.cwd(), onlyFiles: true })
      .filter((filePath) => !filePath.includes('/test-helpers/'))
      .sort();

    expect(outliers).toEqual([]);
  });
});
