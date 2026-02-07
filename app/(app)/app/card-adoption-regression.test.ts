import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_ROUTES_ROOT = join(process.cwd(), 'app', '(app)', 'app');
const DISALLOWED_CARD_WRAPPER = 'rounded-2xl border border-border bg-card';

function collectTsxFilesRecursively(directoryPath: string): string[] {
  const entries = readdirSync(directoryPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsxFilesRecursively(fullPath));
      continue;
    }

    if (
      entry.isFile() &&
      fullPath.endsWith('.tsx') &&
      !fullPath.endsWith('.test.tsx')
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

describe('app card adoption', () => {
  it('avoids inline card wrappers in app route components', () => {
    const appRouteFiles = collectTsxFilesRecursively(APP_ROUTES_ROOT);

    const filesWithInlineCardWrappers = appRouteFiles
      .filter((path) =>
        readFileSync(path, 'utf-8').includes(DISALLOWED_CARD_WRAPPER),
      )
      .map((path) => path.replace(`${process.cwd()}/`, ''));

    expect(filesWithInlineCardWrappers).toEqual([]);
  });
});
