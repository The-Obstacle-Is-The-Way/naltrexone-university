import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import packageJson from '../package.json';
import {
  type LiveTestDoubleRatchetIssues,
  runCli,
} from './test-double-fidelity-live-scan';
import {
  collectOwnCodeModuleMockOccurrences,
  collectRatchetGrowthIssues,
} from './test-double-fidelity-source-scan';

const VITEST_CONFIG_PATH = 'vitest.config.mts';

describe('test-double fidelity command', () => {
  it('fails when a forbidden own-code mock fixture reaches the live scan', () => {
    const occurrences = collectOwnCodeModuleMockOccurrences([
      {
        filePath: 'app/example.test.ts',
        contents: `
          import { vi } from 'vitest';

          vi.mock('@/lib/example', () => ({ example: vi.fn() }));
        `,
      },
    ]);
    const issues: LiveTestDoubleRatchetIssues = {
      ownCodeModuleMocks: collectRatchetGrowthIssues(
        'own-code module mock',
        occurrences,
        new Map(),
      ),
      unknownDoubleCasts: [],
      handRolledPortDoubles: [],
    };

    expect(() => runCli(() => issues)).toThrow(/own-code module mock/);
  });

  it('reports a clean blocking scan without issue details', () => {
    const writeOutput = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    try {
      runCli(() => ({
        ownCodeModuleMocks: [],
        unknownDoubleCasts: [],
        handRolledPortDoubles: [],
      }));

      expect(writeOutput).toHaveBeenCalledWith(
        'PASS test-double-fidelity issues=0\n',
      );
    } finally {
      writeOutput.mockRestore();
    }
  });

  it('runs the blocking fidelity command from the local lint entry point', () => {
    const scripts = packageJson.scripts as Record<string, string>;

    expect(scripts['lint:doubles']).toBe(
      'tsx tests/test-double-fidelity-live-scan.ts',
    );
    expect(scripts.lint).toContain('pnpm lint:doubles');
  });

  it('does not tax every unit invocation through Vitest global setup', () => {
    expect(readFileSync(VITEST_CONFIG_PATH, 'utf8')).not.toContain(
      'test-double-fidelity-global-setup',
    );
  });
});
