import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// BUG-360: E2E setup, resets and evidence helpers write to the shared test
// user's rows. `pnpm test:e2e` checks the database before Playwright starts,
// but Playwright can be started without it, so every connection the E2E code
// opens comes from connectE2EDatabase, which passes its URL through the guard.
const E2E_ROOT = path.resolve('tests/e2e');
const CONNECTION_MODULE = path.join(
  'tests',
  'e2e',
  'helpers',
  'e2e-database-target.ts',
);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')
      ? [entryPath]
      : [];
  });
}

// The module's name, not the name a file imports it as, so an aliased,
// namespace, dynamic or required import is found too. A type-only import
// loads nothing at run time.
const POSTGRES_MODULE = /(['"`])postgres\1/g;
const TYPE_ONLY_IMPORT = /\bimport\s+type\s[^;'"`]*?from\s*(['"`])postgres\1/g;

function postgresLoads(files: Record<string, string>): string[] {
  return Object.entries(files).flatMap(([file, source]) => {
    if (file === CONNECTION_MODULE) return [];
    // Blanked rather than removed, so the line numbers stay true.
    const loads = source.replace(TYPE_ONLY_IMPORT, (statement) =>
      statement.replace(/[^\n]/g, ' '),
    );
    return [...loads.matchAll(POSTGRES_MODULE)].map(
      (match) =>
        `${file}:${loads.slice(0, match.index).split('\n').length} loads the postgres module; open connections with connectE2EDatabase.`,
    );
  });
}

describe('E2E database connections', () => {
  it('reports every file but the connection module that loads the postgres client', () => {
    expect(
      postgresLoads({
        [CONNECTION_MODULE]: "import postgres from 'postgres';",
        'a.ts': "import pg from 'postgres';\nconst sql = pg(url);",
        'b.ts':
          "import type postgres from 'postgres';\ntype Sql = postgres.Sql;",
        'c.ts': "\nconst { default: pg } = await import('postgres');",
        'd.ts':
          'import type {\n  Sql,\n} from \'postgres\';\nimport * as pg from "postgres";',
        'e.ts': "const pg = require('postgres');",
      }),
    ).toEqual([
      'a.ts:1 loads the postgres module; open connections with connectE2EDatabase.',
      'c.ts:2 loads the postgres module; open connections with connectE2EDatabase.',
      'd.ts:4 loads the postgres module; open connections with connectE2EDatabase.',
      'e.ts:1 loads the postgres module; open connections with connectE2EDatabase.',
    ]);
  });

  it('opens every connection the E2E code makes through connectE2EDatabase', () => {
    const files = Object.fromEntries(
      sourceFiles(E2E_ROOT).map((file) => [
        path.relative(process.cwd(), file),
        readFileSync(file, 'utf8'),
      ]),
    );

    expect(Object.keys(files)).toContain(CONNECTION_MODULE);
    expect(postgresLoads(files)).toEqual([]);
  });
});
