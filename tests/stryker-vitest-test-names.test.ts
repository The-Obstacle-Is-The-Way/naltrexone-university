import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// The package's exports do not include the helper, so it is imported by path.
import { collectTestName } from '../node_modules/@stryker-mutator/vitest-runner/dist/src/test-helpers.js';

// DEBT-500: Stryker's Vitest runner runs a mutant's covering tests through a
// testNamePattern it builds from each test's name. Vitest 5 matches that
// pattern against the suite chain joined with ' > ', and runner 9.6.1 joined
// it with a space, so no test nested in a describe matched, and a mutant
// covered only by nested tests ran none of them and survived
// (stryker-js#6210). patches/ joins it with ' > ' until a runner release
// fixes it (#1500). These tests check the patched helper, so they go or
// change with the patch: the proposed upstream fixes reshape it.
const strykerSetupUrl = new URL(
  '../node_modules/@stryker-mutator/vitest-runner/dist/src/stryker-setup.js',
  import.meta.url,
);

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
    const setupSource = readFileSync(strykerSetupUrl, 'utf8');

    expect(setupSource).toContain(collectTestName.toString());
  });
});
