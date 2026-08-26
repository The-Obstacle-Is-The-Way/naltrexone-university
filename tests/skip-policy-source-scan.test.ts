import { describe, expect, it } from 'vitest';
import {
  collectFrameworkControlOccurrences,
  collectSkipPolicyIssues,
  readRepositorySkipPolicySources,
  readSkipPolicySources,
  type SkipPolicySourceFile,
} from './skip-policy-source-scan';

function source(filePath: string, contents: string): SkipPolicySourceFile {
  return { filePath, contents: contents.trimStart() };
}

function documentedAllowanceSources(
  overrides: { checkoutGuard?: string; runnerGuard?: string } = {},
): SkipPolicySourceFile[] {
  const checkoutGuard =
    overrides.checkoutGuard ?? "providerGate.mode === 'skip'";
  const runnerGuard = overrides.runnerGuard ?? "process.platform === 'win32'";

  return [
    source(
      'tests/integration/stripe-checkout-client-contract.integration.test.ts',
      `
        import { describe } from 'vitest';
        const selected = ${checkoutGuard} ? describe.skip : describe;
      `,
    ),
    source(
      'tests/integration/stripe-trial-clock-smoke.integration.test.ts',
      `
        import { describe } from 'vitest';
        const selected = providerGate.mode === 'skip' ? describe.skip : describe;
      `,
    ),
    source(
      'scripts/run-stripe-provider-contracts.test.ts',
      `
        import { it } from 'vitest';
        it.skipIf(${runnerGuard})('x', () => {});
      `,
    ),
    source(
      'scripts/run-stripe-provider-contracts-process.test.ts',
      `
        import { it } from 'vitest';
        it.skipIf(process.platform === 'win32')('x', () => {});
      `,
    ),
  ];
}

describe('skip-policy source scan', () => {
  it.each([
    [
      'describe.skip',
      "import { describe } from 'vitest'; describe.skip('x', () => {});",
      'skip',
    ],
    [
      'test.skipIf',
      "import { test } from 'vitest'; test.skipIf(true)('x', () => {});",
      'skipIf',
    ],
    [
      'it.runIf',
      "import { it } from 'vitest'; it.runIf(true)('x', () => {});",
      'runIf',
    ],
    [
      'test.todo',
      "import { test } from '@playwright/test'; test.todo('x');",
      'todo',
    ],
    [
      'test.fixme',
      "import { test } from '@playwright/test'; test.fixme(true, 'x');",
      'fixme',
    ],
    ['it.only', "import { it } from 'vitest'; it.only('x', () => {});", 'only'],
    [
      "test['skip']",
      "import { test } from '@playwright/test'; test['skip']('x');",
      'skip',
    ],
  ])('detects %s', (_label, contents, method) => {
    const occurrences = collectFrameworkControlOccurrences([
      source('tests/example.test.ts', contents),
    ]);

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]).toMatchObject({
      api: expect.any(String),
      filePath: 'tests/example.test.ts',
      kind: 'call',
      lineNumber: 1,
      method,
    });
  });

  it('resolves an aliased Vitest receiver', () => {
    const occurrences = collectFrameworkControlOccurrences([
      source(
        'tests/example.test.ts',
        `
          import { it as spec } from 'vitest';
          spec.only('x', () => {});
        `,
      ),
    ]);

    expect(occurrences).toEqual([
      expect.objectContaining({ api: 'it', method: 'only', lineNumber: 2 }),
    ]);
  });

  it('resolves a namespace Playwright receiver and nested describe API', () => {
    const occurrences = collectFrameworkControlOccurrences([
      source(
        'tests/e2e/example.spec.ts',
        `
          import * as playwright from '@playwright/test';
          playwright.test.describe.skip('x', () => {});
        `,
      ),
    ]);

    expect(occurrences).toEqual([
      expect.objectContaining({
        api: 'test',
        method: 'skip',
        lineNumber: 2,
      }),
    ]);
  });

  it('detects a conditional describe.skip reference across lines', () => {
    const occurrences = collectFrameworkControlOccurrences([
      source(
        'tests/integration/provider.integration.test.ts',
        `
          import { describe } from 'vitest';
          const selected = condition
            ? describe.skip
            : describe;
        `,
      ),
    ]);

    expect(occurrences).toEqual([
      expect.objectContaining({
        api: 'describe',
        kind: 'conditional-reference',
        lineNumber: 3,
        method: 'skip',
      }),
    ]);
  });

  it('ignores same-named methods that do not resolve to a test-framework import', () => {
    const occurrences = collectFrameworkControlOccurrences([
      source(
        'scripts/example.ts',
        `
          result.skip();
          container.only();
          const report = { skipped: 0 };
        `,
      ),
    ]);

    expect(occurrences).toEqual([]);
  });

  it('does not treat an unrelated imported receiver as a test API', () => {
    const occurrences = collectFrameworkControlOccurrences([
      source(
        'scripts/example.ts',
        `
          import { test } from './production-test-runner';
          test.skip();
        `,
      ),
    ]);

    expect(occurrences).toEqual([]);
  });

  it('accepts only the two provider-gate references and two POSIX cases', () => {
    const issues = collectSkipPolicyIssues(documentedAllowanceSources());

    expect(issues).toEqual([]);
  });

  it.each([
    [
      'a provider allowance no longer uses the fail-closed gate',
      { checkoutGuard: 'true' },
      'stripe-checkout-client-contract.integration.test.ts',
    ],
    [
      'a process allowance no longer targets Windows',
      { runnerGuard: 'true' },
      'run-stripe-provider-contracts.test.ts',
    ],
  ])('fails when %s', (_label, overrides, expectedFile) => {
    const issues = collectSkipPolicyIssues(
      documentedAllowanceSources(overrides),
    );

    expect(issues).toEqual([
      expect.stringContaining(expectedFile),
      expect.stringContaining(expectedFile),
    ]);
  });

  it('fails when a documented allowance grows', () => {
    const issues = collectSkipPolicyIssues([
      source(
        'tests/integration/stripe-checkout-client-contract.integration.test.ts',
        `
          import { describe } from 'vitest';
          const first = providerGate.mode === 'skip' ? describe.skip : describe;
          const second = providerGate.mode === 'skip' ? describe.skip : describe;
        `,
      ),
      source(
        'tests/integration/stripe-trial-clock-smoke.integration.test.ts',
        "import { describe } from 'vitest'; const selected = providerGate.mode === 'skip' ? describe.skip : describe;",
      ),
      source(
        'scripts/run-stripe-provider-contracts.test.ts',
        "import { it } from 'vitest'; it.skipIf(process.platform === 'win32')('x', () => {});",
      ),
      source(
        'scripts/run-stripe-provider-contracts-process.test.ts',
        "import { it } from 'vitest'; it.skipIf(process.platform === 'win32')('x', () => {});",
      ),
    ]);

    expect(issues).toEqual([
      expect.stringContaining(
        'stripe-checkout-client-contract.integration.test.ts',
      ),
    ]);
  });

  it('fails closed when a requested source is unreadable', () => {
    expect(() =>
      readSkipPolicySources(['tests/unreadable.test.ts'], () => {
        throw new Error('permission denied');
      }),
    ).toThrow('SKIP_POLICY_SOURCE_UNREADABLE: tests/unreadable.test.ts');
  });

  it('fails closed when the source walk is empty', () => {
    expect(() => readSkipPolicySources([], () => '')).toThrow(
      'SKIP_POLICY_SOURCE_WALK_EMPTY',
    );
  });

  it('finds no unapproved controls in the live repository', () => {
    expect(collectSkipPolicyIssues(readRepositorySkipPolicySources())).toEqual(
      [],
    );
  });
});
