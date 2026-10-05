import { globSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DOCUMENTATION_FILE_BUDGET_BYTES,
  LARGE_FILES_BEFORE_BUDGET,
  overBudgetDocumentationFiles,
} from '../scripts/documentation-asset-budget';

const KIB = 1024;

describe('documentation file budget', () => {
  it('reports a new file over the budget', () => {
    expect(
      overBudgetDocumentationFiles(
        [
          { file: 'docs/debt/assets/new.png', bytes: 301 * KIB },
          { file: 'docs/debt/assets/small.png', bytes: 300 * KIB },
        ],
        new Set(),
      ),
    ).toEqual({
      overBudget: ['docs/debt/assets/new.png'],
      staleAllowances: [],
    });
  });

  it('allows a listed file that was already over the budget', () => {
    expect(
      overBudgetDocumentationFiles(
        [{ file: 'docs/debt/assets/old.png', bytes: 1200 * KIB }],
        new Set(['docs/debt/assets/old.png']),
      ),
    ).toEqual({ overBudget: [], staleAllowances: [] });
  });

  // The list only shrinks: a listed file that is gone, or now within the
  // budget, must leave the list.
  it('reports a listed file that is gone or now within the budget', () => {
    expect(
      overBudgetDocumentationFiles(
        [{ file: 'docs/debt/assets/shrunk.png', bytes: 200 * KIB }],
        new Set(['docs/debt/assets/shrunk.png', 'docs/debt/assets/gone.png']),
      ),
    ).toEqual({
      overBudget: [],
      staleAllowances: [
        'docs/debt/assets/gone.png',
        'docs/debt/assets/shrunk.png',
      ],
    });
  });

  it('keeps every repository documentation file within the budget', () => {
    const files = globSync('docs/**/*', { withFileTypes: false })
      .filter((file) => statSync(file).isFile())
      .map((file) => ({ file, bytes: statSync(file).size }));

    expect(files.length).toBeGreaterThan(0);
    expect(
      overBudgetDocumentationFiles(files, new Set(LARGE_FILES_BEFORE_BUDGET)),
    ).toEqual({ overBudget: [], staleAllowances: [] });
    expect(DOCUMENTATION_FILE_BUDGET_BYTES).toBe(300 * KIB);
  });

  // 25 files were over the budget when it was introduced; the list may only
  // shrink as they are deleted or compressed.
  it('never grows its list of earlier large files', () => {
    expect(LARGE_FILES_BEFORE_BUDGET.length).toBeLessThanOrEqual(25);
  });
});
