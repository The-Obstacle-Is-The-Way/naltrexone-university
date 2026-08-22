import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  analyzeSourceText,
  calculateCrapScore,
  createCrapReport,
  parseCrapReportArgs,
  runCrapReportCli,
} from './crap-report';

type CoverageRange = {
  start: { line: number; column: number };
  end: { line: number; column: number };
};

type CoverageFixture = {
  path: string;
  statementMap: Record<string, CoverageRange>;
  fnMap: Record<string, never>;
  branchMap: Record<string, never>;
  s: Record<string, number>;
  f: Record<string, number>;
  b: Record<string, number[]>;
};

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

function createTemporaryRepository(): string {
  const directory = mkdtempSync(join(tmpdir(), 'crap-report-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

function writeText(filePath: string, contents: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

function markerRange(source: string, marker: string): CoverageRange {
  const index = source.indexOf(marker);
  if (index < 0) throw new Error(`Marker not found: ${marker}`);

  const prefix = source.slice(0, index);
  const lines = prefix.split('\n');
  const line = lines.length;
  const column = lines.at(-1)?.length ?? 0;

  return {
    start: { line, column },
    end: { line, column: column + marker.length },
  };
}

function createCoverageFixture(
  filePath: string,
  source: string,
  statements: ReadonlyArray<{ marker: string; hits: number }>,
): CoverageFixture {
  const statementMap: Record<string, CoverageRange> = {};
  const hits: Record<string, number> = {};

  statements.forEach((statement, index) => {
    const key = String(index);
    statementMap[key] = markerRange(source, statement.marker);
    hits[key] = statement.hits;
  });

  return {
    path: filePath,
    statementMap,
    fnMap: {},
    branchMap: {},
    s: hits,
    f: {},
    b: {},
  };
}

function writeCoverageMap(
  root: string,
  lane: 'unit' | 'browser' | 'integration',
  entries: ReadonlyArray<CoverageFixture>,
): void {
  writeRawCoverageMap(
    root,
    lane,
    Object.fromEntries(entries.map((entry) => [entry.path, entry])),
  );
}

function writeRawCoverageMap(
  root: string,
  lane: 'unit' | 'browser' | 'integration',
  entries: Record<string, unknown>,
): void {
  const relativePath =
    lane === 'unit'
      ? 'coverage/coverage-final.json'
      : `coverage/${lane}/coverage-final.json`;
  writeText(resolve(root, relativePath), JSON.stringify(entries));
}

function writeEmptyCoverageMaps(root: string): void {
  writeCoverageMap(root, 'unit', []);
  writeCoverageMap(root, 'browser', []);
  writeCoverageMap(root, 'integration', []);
}

function createMergedLaneFixture(): {
  root: string;
  sourcePath: string;
  source: string;
} {
  const root = createTemporaryRepository();
  const sourcePath = resolve(root, 'src/risky.ts');
  const source = [
    'export function risky(flag: boolean) {',
    "  if (flag) return 'yes';",
    "  return 'no';",
    '}',
    '',
  ].join('\n');
  writeText(sourcePath, source);

  writeCoverageMap(root, 'unit', [
    createCoverageFixture(sourcePath, source, [
      { marker: 'if (flag)', hits: 1 },
      { marker: "return 'no'", hits: 0 },
    ]),
  ]);
  writeCoverageMap(root, 'browser', [
    createCoverageFixture(sourcePath, source, [
      { marker: 'if (flag)', hits: 0 },
      { marker: "return 'no'", hits: 1 },
    ]),
  ]);
  writeCoverageMap(root, 'integration', [
    createCoverageFixture(sourcePath, source, [
      { marker: 'if (flag)', hits: 0 },
      { marker: "return 'no'", hits: 0 },
    ]),
  ]);

  return { root, sourcePath, source };
}

describe('calculateCrapScore', () => {
  it('uses complexity as the floor when coverage is complete', () => {
    expect(calculateCrapScore(5, 1)).toBe(5);
  });

  it('squares uncovered complexity', () => {
    expect(calculateCrapScore(30, 0)).toBe(930);
  });

  it('applies the cubic coverage term for partial coverage', () => {
    expect(calculateCrapScore(2, 0.5)).toBe(2.5);
  });

  it('rejects values outside the CRAP formula domain', () => {
    expect(() => calculateCrapScore(0, 1)).toThrow(
      'Complexity must be a positive integer',
    );
    expect(() => calculateCrapScore(1, Number.NaN)).toThrow(
      'Coverage must be a finite fraction',
    );
  });
});

describe('analyzeSourceText complexity', () => {
  it.each([
    ['&&', 'const result = left && right;'],
    ['||', 'const result = left || right;'],
    ['??', 'const result = left ?? right;'],
    ['&&=', 'left &&= right;'],
    ['||=', 'left ||= right;'],
    ['??=', 'left ??= right;'],
  ])('counts %s as a decision point', (_operator, expression) => {
    const source = [
      'function choose(left: boolean | null, right: boolean) {',
      `  ${expression}`,
      '  return left;',
      '}',
    ].join('\n');

    const [result] = analyzeSourceText('/repo/src/example.ts', source);

    expect(result?.complexity).toBe(2);
  });

  it('counts the complete decision-point set', () => {
    const source = [
      'function decisions(input: any, values: any[]) {',
      '  if (input) input = false;',
      '  for (let i = 0; i < 1; i += 1) input = i;',
      '  for (const value of values) input = value;',
      '  for (const key in input) input = key;',
      '  while (input) input = false;',
      '  do { input = false; } while (input);',
      '  switch (input) { case 1: break; case 2: break; default: break; }',
      '  try { input = true; } catch { input = false; }',
      '  const conditional = input ? 1 : 0;',
      '  const andValue = input && conditional;',
      '  const orValue = input || conditional;',
      '  const nullishValue = input ?? conditional;',
      '  input &&= andValue;',
      '  input ||= orValue;',
      '  input ??= nullishValue;',
      '  return input;',
      '}',
    ].join('\n');

    const [result] = analyzeSourceText('/repo/src/example.ts', source);

    expect(result?.complexity).toBe(17);
  });

  it('scores nested functions independently', () => {
    const source = [
      'function outer(flag: boolean) {',
      '  if (flag) flag = false;',
      '  const inner = () => {',
      '    while (flag) flag = false;',
      '    return flag && true;',
      '  };',
      '  return inner();',
      '}',
    ].join('\n');

    const results = analyzeSourceText('/repo/src/example.ts', source);

    expect(
      results.find((result) => result.functionName === 'outer'),
    ).toMatchObject({ complexity: 2 });
    expect(
      results.find((result) => result.functionName === 'inner'),
    ).toMatchObject({ complexity: 3 });
  });

  it('discovers constructors, accessors, and anonymous declarations', () => {
    const source = [
      'class Example {',
      '  constructor() {}',
      '  get value() { return true; }',
      '  set value(next: boolean) { void next; }',
      '}',
      'export default function () { return true; }',
    ].join('\n');

    const results = analyzeSourceText('/repo/src/example.ts', source);

    expect(results.map((result) => result.functionName)).toEqual([
      'constructor',
      'value',
      'value',
      '<anonymous>',
    ]);
  });
});

describe('analyzeSourceText coverage ownership', () => {
  it('assigns statements only to the innermost function span', () => {
    const filePath = '/repo/src/example.ts';
    const source = [
      'export function outer(value: boolean) {',
      '  const inner = () => {',
      '    return value;',
      '  };',
      '  return inner();',
      '}',
    ].join('\n');
    const coverage = createCoverageFixture(filePath, source, [
      { marker: 'const inner', hits: 1 },
      { marker: 'return value', hits: 0 },
      { marker: 'return inner', hits: 1 },
    ]);

    const results = analyzeSourceText(filePath, source, coverage);

    expect(
      results.find((result) => result.functionName === 'outer'),
    ).toMatchObject({ coveredStatements: 2, totalStatements: 2, coverage: 1 });
    expect(
      results.find((result) => result.functionName === 'inner'),
    ).toMatchObject({ coveredStatements: 0, totalStatements: 1, coverage: 0 });
  });

  it('treats a function absent from coverage as uncovered', () => {
    const [result] = analyzeSourceText(
      '/repo/src/example.ts',
      'export function absent() { return true; }',
    );

    expect(result).toMatchObject({
      complexity: 1,
      coverage: 0,
      crap: 2,
    });
  });

  it.each([
    ['line', { start: { line: 0, column: 0 }, end: { line: 1, column: 1 } }],
    ['column', { start: { line: 1, column: -1 }, end: { line: 1, column: 1 } }],
    [
      'location',
      { start: { line: 99, column: 0 }, end: { line: 99, column: 1 } },
    ],
  ])('rejects an invalid coverage statement %s', (kind, range) => {
    const filePath = '/repo/src/example.ts';
    const source = 'export function covered() { return true; }';
    const coverage = createCoverageFixture(filePath, source, [
      { marker: 'return true', hits: 1 },
    ]);
    coverage.statementMap['0'] = range;

    expect(() => analyzeSourceText(filePath, source, coverage)).toThrow(
      `Invalid coverage statement ${kind}`,
    );
  });
});

describe('parseCrapReportArgs', () => {
  it('defaults to a merged observational top-25 report', () => {
    expect(parseCrapReportArgs([])).toEqual({
      json: false,
      lane: 'merged',
      min: 0,
      top: 25,
    });
  });

  it('parses explicit diagnostic and formatting options', () => {
    expect(
      parseCrapReportArgs([
        '--json',
        '--lane',
        'browser',
        '--min=30.5',
        '--top',
        '10',
      ]),
    ).toEqual({
      json: true,
      lane: 'browser',
      min: 30.5,
      top: 10,
    });
  });

  it('rejects invalid configuration', () => {
    expect(() => parseCrapReportArgs(['--top', '0'])).toThrow(
      '--top must be a positive integer',
    );
    expect(() => parseCrapReportArgs(['--lane', 'e2e'])).toThrow(
      '--lane must be one of',
    );
    expect(() => parseCrapReportArgs(['--min', '-1'])).toThrow(
      '--min must be a finite non-negative number',
    );
    expect(() => parseCrapReportArgs(['--top'])).toThrow(
      '--top requires a value',
    );
    expect(() => parseCrapReportArgs(['--top='])).toThrow(
      '--top requires a value',
    );
    expect(() => parseCrapReportArgs(['--unknown'])).toThrow(
      'Unknown option: --unknown',
    );
  });
});

describe('createCrapReport', () => {
  it('merges all three coverage lanes before scoring', () => {
    const { root } = createMergedLaneFixture();

    const merged = createCrapReport({
      cwd: root,
      options: parseCrapReportArgs([]),
    });
    const unit = createCrapReport({
      cwd: root,
      options: parseCrapReportArgs(['--lane', 'unit']),
    });

    expect(merged.entries[0]).toMatchObject({
      functionName: 'risky',
      complexity: 2,
      coverage: 1,
      crap: 2,
    });
    expect(unit.entries[0]).toMatchObject({
      functionName: 'risky',
      complexity: 2,
      coverage: 0.5,
      crap: 2.5,
    });
  });

  it('requires every coverage input selected by the lane', () => {
    const { root } = createMergedLaneFixture();
    rmSync(resolve(root, 'coverage/integration/coverage-final.json'));

    expect(() =>
      createCrapReport({ cwd: root, options: parseCrapReportArgs([]) }),
    ).toThrow('Missing required integration coverage input');
  });

  it('rejects malformed coverage JSON', () => {
    const { root } = createMergedLaneFixture();
    writeText(resolve(root, 'coverage/browser/coverage-final.json'), '{broken');

    expect(() =>
      createCrapReport({ cwd: root, options: parseCrapReportArgs([]) }),
    ).toThrow('Could not parse browser coverage input');
  });

  it('rejects a raw coverage map with an invalid statement counter', () => {
    const { root, sourcePath, source } = createMergedLaneFixture();
    const coverage = createCoverageFixture(sourcePath, source, [
      { marker: 'if (flag)', hits: 1 },
      { marker: "return 'no'", hits: 0 },
    ]);
    writeRawCoverageMap(root, 'unit', {
      [sourcePath]: { ...coverage, s: { ...coverage.s, '0': -1 } },
    });

    expect(() =>
      createCrapReport({ cwd: root, options: parseCrapReportArgs([]) }),
    ).toThrow('Could not parse unit coverage input');
  });

  it('rejects a raw coverage map with an invalid statement range', () => {
    const { root, sourcePath, source } = createMergedLaneFixture();
    const coverage = createCoverageFixture(sourcePath, source, [
      { marker: 'if (flag)', hits: 1 },
      { marker: "return 'no'", hits: 0 },
    ]);
    writeRawCoverageMap(root, 'unit', {
      [sourcePath]: {
        ...coverage,
        statementMap: {
          ...coverage.statementMap,
          '0': {
            start: { line: 2, column: 10 },
            end: { line: 2, column: 2 },
          },
        },
      },
    });

    expect(() =>
      createCrapReport({ cwd: root, options: parseCrapReportArgs([]) }),
    ).toThrow('Could not parse unit coverage input');
  });

  it('rejects incomplete raw statement records', () => {
    const { root, sourcePath, source } = createMergedLaneFixture();
    const coverage = createCoverageFixture(sourcePath, source, [
      { marker: 'if (flag)', hits: 1 },
      { marker: "return 'no'", hits: 0 },
    ]);
    const invalidFileCoverages: unknown[] = [
      {},
      { ...coverage, s: { ...coverage.s, extra: 0 } },
      {
        ...coverage,
        statementMap: {
          ...coverage.statementMap,
          '0': { start: null, end: { line: 2, column: 2 } },
        },
      },
    ];

    for (const invalidFileCoverage of invalidFileCoverages) {
      writeRawCoverageMap(root, 'unit', {
        [sourcePath]: invalidFileCoverage,
      });
      expect(() =>
        createCrapReport({ cwd: root, options: parseCrapReportArgs([]) }),
      ).toThrow('Could not parse unit coverage input');
    }
  });

  it('rejects a non-object coverage map', () => {
    const { root } = createMergedLaneFixture();
    writeText(resolve(root, 'coverage/coverage-final.json'), '[]');

    expect(() =>
      createCrapReport({ cwd: root, options: parseCrapReportArgs([]) }),
    ).toThrow('Could not parse unit coverage input');
  });

  it('reports an unreadable coverage input', () => {
    const { root } = createMergedLaneFixture();
    const unitCoveragePath = resolve(root, 'coverage/coverage-final.json');
    rmSync(unitCoveragePath);
    mkdirSync(unitCoveragePath);

    expect(() =>
      createCrapReport({ cwd: root, options: parseCrapReportArgs([]) }),
    ).toThrow('Could not read unit coverage input');
  });

  it('reports an unreadable source file', () => {
    const { root, sourcePath } = createMergedLaneFixture();
    const readError = Object.assign(new Error('permission denied'), {
      code: 'EACCES',
    });

    expect(() =>
      createCrapReport({
        cwd: root,
        options: parseCrapReportArgs([]),
        readSourceFile: (filePath) => {
          expect(filePath).toBe(sourcePath);
          throw readError;
        },
      }),
    ).toThrow('Could not read source src/risky.ts');
  });

  it('rejects source parse diagnostics', () => {
    const root = createTemporaryRepository();
    writeText(resolve(root, 'src/broken.ts'), 'export function broken( {');
    writeEmptyCoverageMaps(root);

    expect(() =>
      createCrapReport({ cwd: root, options: parseCrapReportArgs([]) }),
    ).toThrow('Could not parse src/broken.ts');
  });

  it('excludes test files and support while retaining runtime entry points', () => {
    const root = createTemporaryRepository();
    writeText(resolve(root, 'src/production.ts'), 'export function kept() {}');
    writeText(
      resolve(root, 'src/production.test.ts'),
      'export function testOnly() {}',
    );
    writeText(
      resolve(root, 'src/application/test-helpers/fake.ts'),
      'export function fakeOnly() {}',
    );
    writeText(resolve(root, 'proxy.ts'), 'export default function proxy() {}');
    writeEmptyCoverageMaps(root);

    const report = createCrapReport({
      cwd: root,
      options: parseCrapReportArgs([]),
    });

    expect(report.totalFunctions).toBe(2);
    expect(report.entries.map((entry) => entry.functionName).sort()).toEqual([
      'kept',
      'proxy',
    ]);
  });
});

describe('runCrapReportCli', () => {
  it('exits zero when a metric filter produces no rows', () => {
    const { root } = createMergedLaneFixture();
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = runCrapReportCli({
      argv: ['--min', '1000'],
      cwd: root,
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
    });

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join('\n')).toContain('No functions matched');
  });

  it('exits nonzero when report infrastructure is invalid', () => {
    const root = createTemporaryRepository();
    const stderr: string[] = [];

    const exitCode = runCrapReportCli({
      argv: [],
      cwd: root,
      stdout: () => undefined,
      stderr: (line) => stderr.push(line),
    });

    expect(exitCode).toBe(1);
    expect(stderr.join('\n')).toContain('Missing required unit coverage input');
  });

  it('exits nonzero when CLI configuration is invalid', () => {
    const stderr: string[] = [];

    const exitCode = runCrapReportCli({
      argv: ['--top', '0'],
      cwd: createTemporaryRepository(),
      stdout: () => undefined,
      stderr: (line) => stderr.push(line),
    });

    expect(exitCode).toBe(1);
    expect(stderr.join('\n')).toContain('--top must be a positive integer');
  });

  it('exits nonzero for a raw coverage map with an invalid counter', () => {
    const { root, sourcePath, source } = createMergedLaneFixture();
    const coverage = createCoverageFixture(sourcePath, source, [
      { marker: 'if (flag)', hits: 1 },
      { marker: "return 'no'", hits: 0 },
    ]);
    writeRawCoverageMap(root, 'unit', {
      [sourcePath]: { ...coverage, s: { ...coverage.s, '0': 0.5 } },
    });
    const stderr: string[] = [];

    const exitCode = runCrapReportCli({
      argv: [],
      cwd: root,
      stdout: () => undefined,
      stderr: (line) => stderr.push(line),
    });

    expect(exitCode).toBe(1);
    expect(stderr.join('\n')).toContain('Could not parse unit coverage input');
  });

  it('exits nonzero for a raw coverage map with an invalid range', () => {
    const { root, sourcePath, source } = createMergedLaneFixture();
    const coverage = createCoverageFixture(sourcePath, source, [
      { marker: 'if (flag)', hits: 1 },
      { marker: "return 'no'", hits: 0 },
    ]);
    writeRawCoverageMap(root, 'unit', {
      [sourcePath]: {
        ...coverage,
        statementMap: {
          ...coverage.statementMap,
          '0': {
            start: { line: 2, column: 10 },
            end: { line: 1, column: 0 },
          },
        },
      },
    });
    const stderr: string[] = [];

    const exitCode = runCrapReportCli({
      argv: [],
      cwd: root,
      stdout: () => undefined,
      stderr: (line) => stderr.push(line),
    });

    expect(exitCode).toBe(1);
    expect(stderr.join('\n')).toContain('Could not parse unit coverage input');
  });

  it('emits a ranked table by default', () => {
    const { root } = createMergedLaneFixture();
    const stdout: string[] = [];

    const exitCode = runCrapReportCli({
      argv: ['--top', '1'],
      cwd: root,
      stdout: (line) => stdout.push(line),
      stderr: () => undefined,
    });

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).toContain(
      '| src/risky.ts:1 | risky | 2 | 100.00% | 2.00 |',
    );
  });

  it('uses console reporters when no output adapters are supplied', () => {
    const { root } = createMergedLaneFixture();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    expect(runCrapReportCli({ argv: ['--top', '1'], cwd: root })).toBe(0);
    expect(runCrapReportCli({ argv: ['--top', '0'], cwd: root })).toBe(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('CRAP report'));
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('--top must be a positive integer'),
    );

    log.mockRestore();
    error.mockRestore();
  });

  it('emits machine-readable JSON', () => {
    const { root } = createMergedLaneFixture();
    const stdout: string[] = [];

    const exitCode = runCrapReportCli({
      argv: ['--json'],
      cwd: root,
      stdout: (line) => stdout.push(line),
      stderr: () => undefined,
    });
    const output = JSON.parse(stdout.join('\n')) as {
      lane: string;
      entries: Array<{ functionName: string }>;
    };

    expect(exitCode).toBe(0);
    expect(output.lane).toBe('merged');
    expect(output.entries[0]?.functionName).toBe('risky');
  });
});
