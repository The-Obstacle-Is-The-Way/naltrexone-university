import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

// DEBT-500: Stryker's Vitest runner runs a mutant's covering tests through a
// testNamePattern it builds from each test's name. Vitest 5 matches that
// pattern against the suite chain joined with ' > ', and runner 9.6.1 joined
// it with a space, so no covering test ran and every mutant with per-test
// coverage survived (stryker-js#6210). patches/ joins it with ' > ' until a
// runner release fixes it (#1500). These tests check the patched helper, so
// they go or change with the patch: the proposed upstream fixes reshape it.
const runnerDir = dirname(
  require.resolve('@stryker-mutator/vitest-runner/package.json'),
);

type CollectTestName = (test: {
  name: string;
  suite?: { name: string; suite?: unknown } | undefined;
}) => string;

let collectTestName: CollectTestName;

beforeAll(async () => {
  // The package's exports do not include the helper, so it is loaded by path.
  ({ collectTestName } = await import(
    pathToFileURL(join(runnerDir, 'dist/src/test-helpers.js')).href
  ));
});

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

it("selects a top-level test with the name filter it builds from the test's name", ({
  task,
}) => {
  const filter = new RegExp(escapeRegExp(collectTestName(task)));

  // Vitest 5 skips a test whose fullTestName does not match the filter.
  expect(task.fullTestName).toMatch(filter);
});

describe('Stryker Vitest runner', () => {
  describe('a nested suite', () => {
    it("selects this test with the name filter it builds from the test's name", ({
      task,
    }) => {
      const filter = new RegExp(escapeRegExp(collectTestName(task)));

      // Vitest 5 skips a test whose fullTestName does not match the filter.
      expect(task.fullTestName).toMatch(filter);
    });
  });

  it('names tests the same way in the setup file it copies into the sandbox', () => {
    // Per-test coverage IDs come from the setup copy and the filter from the
    // helper, so the two must name a test identically.
    const setupSource = readFileSync(
      join(runnerDir, 'dist/src/stryker-setup.js'),
      'utf8',
    );

    expect(setupSource).toContain(collectTestName.toString());
  });
});
