import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// BUG-360: E2E setup, resets and evidence helpers write to the shared test
// user's rows. `pnpm test:e2e` checks the database before Playwright starts,
// but Playwright can be started without it, so every connection the E2E code
// opens passes its URL through guardE2EDatabaseUrl.
const E2E_ROOT = path.resolve('tests/e2e');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')
      ? [entryPath]
      : [];
  });
}

function unguardedConnections(files: Record<string, string>): string[] {
  return Object.entries(files).flatMap(([file, source]) =>
    // A call, not regex text such as /postgres(?:ql)?:/ in a redaction.
    [
      ...source.matchAll(
        /(?<![\w/])postgres\((?!\?)(?!\s*guardE2EDatabaseUrl\()/g,
      ),
    ].map(
      (match) =>
        `${file}:${source.slice(0, match.index).split('\n').length} opens a database without guardE2EDatabaseUrl.`,
    ),
  );
}

describe('E2E database connections', () => {
  it('reports a connection whose URL skips the guard', () => {
    expect(
      unguardedConnections({
        'a.ts': 'const sql = postgres(process.env.DATABASE_URL);',
        'b.ts': 'const sql = postgres(guardE2EDatabaseUrl(url), { max: 1 });',
        // Biome wraps the arguments once the first one overflows the line.
        'c.ts':
          'const sql = postgres(\n  guardE2EDatabaseUrl(url),\n  { max: 1 },\n);',
        'd.ts': '\nconst sql = postgres(\n  url,\n);',
      }),
    ).toEqual([
      'a.ts:1 opens a database without guardE2EDatabaseUrl.',
      'd.ts:2 opens a database without guardE2EDatabaseUrl.',
    ]);
  });

  it('passes every connection the E2E code opens through the guard', () => {
    const files = Object.fromEntries(
      sourceFiles(E2E_ROOT).map((file) => [
        path.relative(process.cwd(), file),
        readFileSync(file, 'utf8'),
      ]),
    );

    expect(Object.keys(files).length).toBeGreaterThan(0);
    expect(unguardedConnections(files)).toEqual([]);
  });
});
