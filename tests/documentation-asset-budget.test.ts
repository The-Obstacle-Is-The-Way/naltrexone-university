import { globSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DOCUMENTATION_FILE_BUDGET_BYTES,
  overBudgetDocumentationFiles,
} from '../scripts/documentation-asset-budget';

const KIB = 1024;

describe('documentation file budget', () => {
  it('reports a file over the budget', () => {
    expect(
      overBudgetDocumentationFiles([
        { file: 'docs/guides/new.png', bytes: 301 * KIB },
        { file: 'docs/guides/small.png', bytes: 300 * KIB },
      ]),
    ).toEqual(['docs/guides/new.png']);
  });

  it('keeps every repository documentation file within the budget', () => {
    const files = globSync('docs/**/*', { withFileTypes: false })
      .filter((file) => statSync(file).isFile())
      .map((file) => ({ file, bytes: statSync(file).size }));

    expect(files.length).toBeGreaterThan(0);
    expect(overBudgetDocumentationFiles(files)).toEqual([]);
    expect(DOCUMENTATION_FILE_BUDGET_BYTES).toBe(300 * KIB);
  });
});
