import { beforeAll, describe, expect, it } from 'vitest';
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
      'suite.skip',
      "import { suite } from 'vitest'; suite.skip('x', () => {});",
      'skip',
    ],
    [
      'bench.skipIf',
      "import { bench } from 'vitest'; bench.skipIf(true)('x', () => {});",
      'skipIf',
    ],
    [
      "test['skip']",
      "import { test } from '@playwright/test'; test['skip']('x');",
      'skip',
    ],
    [
      "test['\\u0073kip']",
      String.raw`import { test } from '@playwright/test'; test['\u0073kip']('x');`,
      'skip',
    ],
  ])('detects %s', (_label, contents, method) => {
    const occurrences = collectFrameworkControlOccurrences([
      source('tests/example.test.ts', contents),
    ]);

    expect(occurrences).toEqual([
      expect.objectContaining({
        filePath: 'tests/example.test.ts',
        kind: 'call',
        lineNumber: 1,
        method,
        resolution: 'framework',
      }),
    ]);
  });

  it('recognizes direct import aliases and namespace APIs', () => {
    const occurrences = collectFrameworkControlOccurrences([
      source(
        'tests/example.test.ts',
        `
          import { it as spec } from 'vitest';
          import * as playwright from '@playwright/test';
          spec.only('focused', () => {});
          playwright.test.describe.skip('group', () => {});
        `,
      ),
    ]);

    expect(occurrences).toEqual([
      expect.objectContaining({ api: 'it', method: 'only' }),
      expect.objectContaining({ api: 'describe', method: 'skip' }),
    ]);
  });

  it('detects a control member used through a chained table API', () => {
    const occurrences = collectFrameworkControlOccurrences([
      source(
        'tests/example.test.ts',
        "import { test } from 'vitest'; test.skip.each([1])('x', () => {});",
      ),
    ]);

    expect(occurrences).toEqual([
      expect.objectContaining({
        api: 'test',
        kind: 'reference',
        method: 'skip',
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

  it('fails closed when a control receiver cannot be classified', () => {
    const issues = collectSkipPolicyIssues(
      [source('scripts/example.cjs', "mystery.skip('x');")],
      [],
    );

    expect(issues).toEqual([
      expect.stringContaining(
        'scripts/example.cjs:1 unapproved unresolved receiver mystery.skip',
      ),
    ]);
  });

  it('ignores controls on clearly non-framework bindings', () => {
    const occurrences = collectFrameworkControlOccurrences([
      source(
        'scripts/example.ts',
        `
          import { test as productionTest } from './production-test-runner';
          productionTest.skip();
          productionTest().skip();
        `,
      ),
    ]);

    expect(occurrences).toEqual([]);
  });

  it('accepts only the two provider-gate references and two POSIX cases', () => {
    expect(collectSkipPolicyIssues(documentedAllowanceSources())).toEqual([]);
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

  describe('live repository', () => {
    let repositorySources: SkipPolicySourceFile[];
    let repositoryFilePaths: string[];

    beforeAll(() => {
      repositorySources = readRepositorySkipPolicySources();
      repositoryFilePaths = repositorySources.map(
        (sourceFile) => sourceFile.filePath,
      );
    });

    it('walks test files at the repository root', () => {
      expect(repositoryFilePaths).toContain('proxy.test.ts');
    });

    it('walks executable source and setup files outside named roots', () => {
      expect(repositoryFilePaths).toEqual(
        expect.arrayContaining([
          'db/schema.test.ts',
          'instrumentation.ts',
          'proxy.ts',
          'vitest.setup.ts',
        ]),
      );
    });

    it('excludes generated source artifacts from the repository walk', () => {
      expect(repositoryFilePaths).not.toContain('next-env.d.ts');
    });

    it('finds no unapproved controls in the live repository', () => {
      expect(collectSkipPolicyIssues(repositorySources)).toEqual([]);
    });
  });
});
