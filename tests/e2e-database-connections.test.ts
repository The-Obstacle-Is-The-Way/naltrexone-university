import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from '@typescript/typescript6';
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

// Every string that names the module, not the name a file imports it as, so
// an aliased, namespace, dynamic or required import is found too, and a
// comment can hide none of them.
function postgresLoads(files: Record<string, string>): string[] {
  return Object.entries(files).flatMap(([file, source]) => {
    if (file === CONNECTION_MODULE) return [];
    const parsed = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const lines: number[] = [];
    function visit(node: ts.Node): void {
      if (
        (ts.isStringLiteral(node) ||
          ts.isNoSubstitutionTemplateLiteral(node)) &&
        node.text === 'postgres' &&
        !namesTypesOnly(node)
      ) {
        lines.push(
          parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1,
        );
      }
      ts.forEachChild(node, visit);
    }
    visit(parsed);
    return lines.map(
      (line) =>
        `${file}:${line} loads the postgres module; open connections with connectE2EDatabase.`,
    );
  });
}

// A type-only import or export, or a type query, loads nothing at run time.
function namesTypesOnly(specifier: ts.Node): boolean {
  const parent = specifier.parent;
  if (ts.isImportDeclaration(parent)) {
    return parent.importClause?.isTypeOnly === true;
  }
  if (ts.isExportDeclaration(parent)) return parent.isTypeOnly;
  return ts.isLiteralTypeNode(parent) && ts.isImportTypeNode(parent.parent);
}

describe('E2E database connections', () => {
  it('reports every file but the connection module that loads the postgres client', () => {
    expect(
      postgresLoads({
        [CONNECTION_MODULE]: "import postgres from 'postgres';",
        'a.ts': "import pg from 'postgres';\nconst sql = pg(url);",
        'b.ts':
          "import type postgres from 'postgres';\nimport type * as pg from 'postgres';",
        'c.ts': "\nconst { default: pg } = await import('postgres');",
        'd.ts':
          'import type {\n  Sql,\n} from \'postgres\';\nimport * as pg from "postgres";',
        'e.ts': "const pg = require('postgres');",
        // The words "import type" in a comment do not make the import below
        // them type-only.
        'f.ts': "// Prefer import type for Sql\nimport pg from 'postgres';",
        'g.ts':
          "/*\nimport type checks are cheap\n*/\nimport pg from 'postgres';",
        'h.ts':
          "/*\nimport type {\n*/\nimport { default as pg } from 'postgres';",
        'i.ts': "type Sql = import('postgres').Sql;",
      }),
    ).toEqual([
      'a.ts:1 loads the postgres module; open connections with connectE2EDatabase.',
      'c.ts:2 loads the postgres module; open connections with connectE2EDatabase.',
      'd.ts:4 loads the postgres module; open connections with connectE2EDatabase.',
      'e.ts:1 loads the postgres module; open connections with connectE2EDatabase.',
      'f.ts:2 loads the postgres module; open connections with connectE2EDatabase.',
      'g.ts:4 loads the postgres module; open connections with connectE2EDatabase.',
      'h.ts:4 loads the postgres module; open connections with connectE2EDatabase.',
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
