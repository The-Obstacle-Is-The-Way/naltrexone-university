import { describe, expect, it } from 'vitest';
import { childProcessModuleMocks } from './script-transport-policy';
import { readTestSources } from './test-double-fidelity-source-scan';

describe('process adapter test boundary', () => {
  it.each([
    "vi.mock('node:child_process', () => ({}))",
    "vi.doMock('child_process', () => ({}))",
    "vi['mock']('node:child_process')",
    "import { vi as testVi } from 'vitest'; testVi.mock('node:child_process')",
    "import * as v from 'vitest'; v.vi.mock('node:child_process')",
    "vi.mock(import('node:child_process'), () => ({}))",
  ])('detects a literal child-process module replacement: %s', (source) => {
    expect(
      childProcessModuleMocks([
        { filePath: 'fixture.test.ts', contents: source },
      ]),
    ).toEqual(['fixture.test.ts:1']);
  });
  it('ignores prose, other modules and a real child-process import', () => {
    expect(
      childProcessModuleMocks([
        {
          filePath: 'fixture.test.ts',
          contents: `
      import { spawnSync } from 'node:child_process';
      // vi.mock('node:child_process')
      const prose = "vi.mock('node:child_process')";
      vi.mock('server-only', () => ({}));
    `,
        },
      ]),
    ).toEqual([]);
  });
  it('keeps repository tests on injected seams or real executable fixtures', () => {
    expect(childProcessModuleMocks(readTestSources())).toEqual([]);
  });
});
