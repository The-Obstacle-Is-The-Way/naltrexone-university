import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  collectOutputSchemaSourceIssues,
  collectPassThroughDatetimeFields,
  getZodContractIssues,
  parseSourceText,
  readControllerSources,
} from './controller-output-datetime-source-scan';

// The real census runs in
// src/adapters/controllers/controller-output-datetime-contract.test.ts; these
// synthetic inputs prove each drift the scanner is meant to report.
const CONTROLLER_FILE = 'src/adapters/controllers/example-controller.ts';

function scanSource(source: string): string[] {
  return collectOutputSchemaSourceIssues([
    parseSourceText(CONTROLLER_FILE, source),
  ]);
}

function scanPassThrough(source: string, typeName = 'ExampleOutput') {
  return collectPassThroughDatetimeFields(
    [
      {
        filePath: 'src/application/example.ts',
        typeName,
        prefix: '',
        action: 'getExample',
      },
    ],
    (filePath) => parseSourceText(filePath, source),
  );
}

describe('getZodContractIssues', () => {
  it('reports z.date() fields', () => {
    const issues = getZodContractIssues(
      z.object({ createdAt: z.date() }),
      'ExampleOutputSchema',
    );

    expect(issues).toEqual([
      expect.stringContaining('ExampleOutputSchema.createdAt uses z.date();'),
      expect.stringContaining(
        'ExampleOutputSchema.createdAt uses z.date(); schema-backed',
      ),
    ]);
  });

  it('reports date-like numbers and undated strings', () => {
    const issues = getZodContractIssues(
      z.object({ expiresAt: z.number(), updatedAt: z.string() }),
      'ExampleOutputSchema',
    );

    expect(issues).toEqual([
      expect.stringContaining(
        'ExampleOutputSchema.expiresAt uses date-like z.number()',
      ),
      expect.stringContaining('ExampleOutputSchema.updatedAt uses z.string()'),
    ]);
  });

  it('descends into arrays, including a root array', () => {
    expect(
      getZodContractIssues(
        z.array(z.object({ answeredAt: z.date() })),
        'RootOutputSchema',
      ),
    ).toContainEqual(
      expect.stringContaining('RootOutputSchema.[].answeredAt uses z.date();'),
    );
    expect(
      getZodContractIssues(
        z.object({ rows: z.array(z.object({ answeredAt: z.date() })) }),
        'RowsOutputSchema',
      ),
    ).toContainEqual(
      expect.stringContaining(
        'RowsOutputSchema.rows[].answeredAt uses z.date();',
      ),
    );
  });

  it('checks every union option', () => {
    expect(
      getZodContractIssues(
        z.object({ answeredAt: z.union([z.string().datetime(), z.date()]) }),
        'UnionOutputSchema',
      ),
    ).toContainEqual(
      expect.stringContaining('UnionOutputSchema.answeredAt uses z.date();'),
    );
  });

  it('accepts optional and nullable ISO datetime strings', () => {
    expect(
      getZodContractIssues(
        z.object({ endedAt: z.string().datetime().nullable().optional() }),
        'ValidOutputSchema',
      ),
    ).toEqual([]);
  });
});

describe('collectOutputSchemaSourceIssues', () => {
  it('reports a date-like field built by a non-z helper', () => {
    expect(
      scanSource(
        'const HelperOutputSchema = z.object({ expiresAt: makeDate() });',
      ),
    ).toEqual([
      expect.stringContaining(
        'HelperOutputSchema.expiresAt is date-like but is not z.string().datetime()',
      ),
    ]);
  });

  it('reports quoted property names like identifiers', () => {
    expect(
      scanSource(
        "const QuotedOutputSchema = z.object({ 'createdAt': z.date() });",
      ),
    ).toContainEqual(
      expect.stringContaining('QuotedOutputSchema.createdAt uses z.date()'),
    );
  });

  it('skips spread and computed members it cannot name', () => {
    expect(
      scanSource(
        'const SpreadOutputSchema = z.object({ ...base, [key]: z.date() });',
      ),
    ).toEqual([]);
  });

  it('accepts nullish date-like members', () => {
    expect(
      scanSource(`const NullishOutputSchema = z.object({
        deletedAt: z.null(),
        archivedAt: z.undefined(),
        closedAt: z.literal(null),
      });`),
    ).toEqual([]);
  });

  it('treats a non-null literal as a date-like drift', () => {
    expect(
      scanSource(
        "const LiteralOutputSchema = z.object({ closedAt: z.literal('never') });",
      ),
    ).toEqual([
      expect.stringContaining(
        'LiteralOutputSchema.closedAt is date-like but is not z.string().datetime()',
      ),
    ]);
  });

  it('ignores shapes and options it cannot read statically', () => {
    expect(
      scanSource(`const OpaqueOutputSchema = z.object({
        shape: z.object(shape),
        list: z.array(),
        pick: z.union(options),
        expiresAt: z.string().datetime().or(),
      });`),
    ).toEqual([]);
  });
});

describe('collectPassThroughDatetimeFields', () => {
  it('fails loudly when a configured type alias is missing', () => {
    expect(() => scanPassThrough('type Other = { id: string };')).toThrow(
      'Missing type alias ExampleOutput in src/application/example.ts',
    );
  });

  it('collects string-typed date-like fields through arrays, aliases and nullish unions', () => {
    const { fields, issues } = scanPassThrough(`
      type Row = { answeredAt: string };
      type Rows = Row[];
      type MoreRows = Array<Row>;
      type ExampleOutput = {
        startedAt: string;
        endedAt: string | null;
        archivedAt: undefined;
        closedAt: 'never' | null;
        rows: Rows;
        more: MoreRows;
        list: Array<{ updatedAt: string }>;
        items: { expiresAt: string }[];
        [key: string]: unknown;
        describe(): void;
        ['computedAt']: string;
      };
    `);

    expect(issues).toEqual([]);
    expect(fields).toEqual([
      'getExample:archivedAt',
      'getExample:closedAt',
      'getExample:endedAt',
      'getExample:items[].expiresAt',
      'getExample:list[].updatedAt',
      'getExample:more[].answeredAt',
      'getExample:rows[].answeredAt',
      'getExample:startedAt',
    ]);
  });

  it('reports a date-like pass-through field not typed as a string', () => {
    const { issues } = scanPassThrough(
      'type ExampleOutput = { createdAt: number };',
    );

    expect(issues).toEqual([
      expect.stringContaining(
        'createdAt is date-like but is not typed as string/string|null',
      ),
    ]);
  });
});

describe('readControllerSources', () => {
  let root: string | undefined;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  it('reads nested controller sources and skips tests, helpers and non-TypeScript files', () => {
    root = mkdtempSync(join(tmpdir(), 'datetime-scan-'));
    mkdirSync(join(root, 'nested'));
    for (const name of [
      'a-controller.ts',
      'nested/b-controller.ts',
      'a-controller.test.ts',
      'a-controller-test-helpers.ts',
      'README.md',
    ]) {
      writeFileSync(join(root, name), 'export const x = 1;\n');
    }

    const filePaths = readControllerSources(root).map((file) => file.filePath);

    expect(filePaths).toHaveLength(2);
    expect(filePaths.some((path) => path.endsWith('/a-controller.ts'))).toBe(
      true,
    );
    expect(
      filePaths.some((path) => path.endsWith('/nested/b-controller.ts')),
    ).toBe(true);
  });
});
