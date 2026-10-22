import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  checkMutationReport,
  runMutationReportIntegrity,
} from './mutation-report-integrity';

type Mutant = { id: string; status: string; testsCompleted?: number };

function report(mutants: Record<string, Mutant[]>) {
  return {
    files: Object.fromEntries(
      Object.entries(mutants).map(([file, entries]) => [
        file,
        { mutants: entries },
      ]),
    ),
  };
}

function capture() {
  const lines: string[] = [];
  return {
    lines,
    output: {
      log: (line: string) => lines.push(line),
      error: (line: string) => lines.push(line),
    },
  };
}

describe('checkMutationReport', () => {
  it('accepts a report whose survivors each ran a covering test', () => {
    const result = checkMutationReport(
      report({
        'src/a.ts': [
          { id: '1', status: 'Killed', testsCompleted: 3 },
          { id: '2', status: 'Survived', testsCompleted: 2 },
          // A timed-out mutant is stopped before its tests complete.
          { id: '3', status: 'Timeout', testsCompleted: 0 },
          { id: '4', status: 'NoCoverage', testsCompleted: 0 },
        ],
      }),
    );

    expect(result).toEqual({ mutants: 4, untested: [], unrecorded: [] });
  });

  it('names each survivor that ran no test', () => {
    const result = checkMutationReport(
      report({
        'src/a.ts': [{ id: '7', status: 'Survived', testsCompleted: 0 }],
        'src/b.ts': [{ id: '9', status: 'Survived', testsCompleted: 1 }],
      }),
    );

    expect(result.untested).toEqual(['src/a.ts#7']);
  });

  it('names each survivor whose test count the report does not record', () => {
    const result = checkMutationReport(
      report({ 'src/a.ts': [{ id: '5', status: 'Survived' }] }),
    );

    expect(result.unrecorded).toEqual(['src/a.ts#5']);
  });

  it('treats a negative or fractional test count as unrecorded, since neither shows a test completed', () => {
    const result = checkMutationReport(
      report({
        'src/a.ts': [
          { id: '1', status: 'Survived', testsCompleted: -1 },
          { id: '2', status: 'Survived', testsCompleted: 0.5 },
        ],
      }),
    );

    expect(result).toEqual({
      mutants: 2,
      untested: [],
      unrecorded: ['src/a.ts#1', 'src/a.ts#2'],
    });
  });

  it('rejects a status Stryker does not define, rather than skipping a near-miss survivor', () => {
    expect(() =>
      checkMutationReport(
        report({
          'src/a.ts': [{ id: '1', status: 'Survive', testsCompleted: 0 }],
        }),
      ),
    ).toThrow('Invalid mutation report: unknown mutant status "Survive"');
  });

  it.each([
    ['files that are not keyed by path', { files: [] }],
    [
      'a file without a mutant list',
      { files: { 'src/a.ts': { mutants: {} } } },
    ],
    [
      'a mutant without a status',
      { files: { 'src/a.ts': { mutants: [{ id: '1' }] } } },
    ],
  ])('rejects a report with %s', (_shape, invalid) => {
    expect(() => checkMutationReport(invalid)).toThrow(
      'Invalid mutation report',
    );
  });
});

describe('runMutationReportIntegrity', () => {
  it('passes a report whose survivors ran tests', () => {
    const { lines, output } = capture();

    const code = runMutationReportIntegrity(
      () =>
        JSON.stringify(
          report({
            'src/a.ts': [{ id: '1', status: 'Survived', testsCompleted: 4 }],
          }),
        ),
      output,
    );

    expect(code).toBe(0);
    expect(lines).toEqual([
      'Mutation report integrity: 1 mutants; every survivor ran a test.',
    ]);
  });

  it('fails a report in which a survivor ran no test, so the score cannot be trusted', () => {
    const { lines, output } = capture();

    const code = runMutationReportIntegrity(
      () =>
        JSON.stringify(
          report({
            'src/a.ts': [
              { id: '1', status: 'Survived', testsCompleted: 0 },
              { id: '2', status: 'Survived', testsCompleted: 0 },
            ],
          }),
        ),
      output,
    );

    expect(code).toBe(1);
    expect(lines.join('\n')).toContain(
      '2 of 2 mutants survived without running a test',
    );
    expect(lines.join('\n')).toContain('src/a.ts#1');
  });

  it('shows five untested survivors and marks the rest as omitted', () => {
    const { lines, output } = capture();
    const survivors = ['1', '2', '3', '4', '5', '6'].map((id) => ({
      id,
      status: 'Survived',
      testsCompleted: 0,
    }));

    runMutationReportIntegrity(
      () => JSON.stringify(report({ 'src/a.ts': survivors })),
      output,
    );

    expect(lines.join('\n')).toContain(
      'Examples: src/a.ts#1, src/a.ts#2, src/a.ts#3, src/a.ts#4, src/a.ts#5, …',
    );
    expect(lines.join('\n')).not.toContain('src/a.ts#6');
  });

  it('fails when the report does not record how many tests a survivor ran', () => {
    const { lines, output } = capture();

    const code = runMutationReportIntegrity(
      () =>
        JSON.stringify(
          report({ 'src/a.ts': [{ id: '1', status: 'Survived' }] }),
        ),
      output,
    );

    expect(code).toBe(1);
    expect(lines.join('\n')).toContain(
      '1 survivors have no valid testsCompleted count',
    );
  });

  it('fails when the report cannot be read', () => {
    const { lines, output } = capture();

    const code = runMutationReportIntegrity(() => {
      throw new Error('ENOENT');
    }, output);

    expect(code).toBe(1);
    expect(lines.join('\n')).toContain(
      'Could not read reports/mutation/mutation.json',
    );
  });

  it('runs right after Stryker in the mutation workflow, which still uploads the report', () => {
    const workflow = parse(
      readFileSync('.github/workflows/mutation.yml', 'utf8'),
    );
    const steps: { name: string; run?: string; if?: string }[] =
      workflow.jobs.mutation.steps;

    const stryker = steps.findIndex((step) => step.name === 'Run Stryker');
    expect(steps[stryker + 1]?.run).toBe(
      'pnpm exec tsx scripts/quality/mutation-report-integrity.ts',
    );
    expect(
      steps.find((step) => step.name === 'Upload mutation report')?.if,
    ).toBe('always()');
  });
});
