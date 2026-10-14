import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// A mutant "survives" when the tests Stryker ran against it all passed. One
// that ran no test was never tested, so a report holding such survivors
// measures nothing. On Vitest 5 the runner's test filter matched no nested
// test, and 2,786 mutants survived that way: the run scored 3.70% and passed
// (DEBT-500, stryker-js#6210). ADR-019 keeps the score observational, but
// requires a report that cannot be trusted to fail its run, as CRAP's does for
// missing coverage. So this check fails the run on such survivors. A timed-out
// mutant is stopped before its tests complete, so only survivors are checked.

const REPORT_PATH = 'reports/mutation/mutation.json';
// Enough examples to locate the fault without flooding the log.
const EXAMPLES_SHOWN = 5;

export type MutationReportCheck = {
  mutants: number;
  // `file#id` of each survivor that ran no test.
  untested: string[];
  // `file#id` of each survivor whose test count the report leaves out.
  unrecorded: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function checkMutationReport(report: unknown): MutationReportCheck {
  if (!isRecord(report) || !isRecord(report.files))
    throw new Error('Invalid mutation report');
  const result: MutationReportCheck = {
    mutants: 0,
    untested: [],
    unrecorded: [],
  };
  for (const [file, entry] of Object.entries(report.files)) {
    if (!isRecord(entry) || !Array.isArray(entry.mutants))
      throw new Error('Invalid mutation report');
    for (const mutant of entry.mutants) {
      if (!isRecord(mutant) || typeof mutant.status !== 'string')
        throw new Error('Invalid mutation report');
      result.mutants++;
      if (mutant.status !== 'Survived') continue;
      const name = `${file}#${String(mutant.id)}`;
      if (typeof mutant.testsCompleted !== 'number')
        result.unrecorded.push(name);
      else if (mutant.testsCompleted === 0) result.untested.push(name);
    }
  }
  return result;
}

function examples(names: string[]): string {
  const shown = names.slice(0, EXAMPLES_SHOWN).join(', ');
  return names.length > EXAMPLES_SHOWN ? `${shown}, …` : shown;
}

export function runMutationReportIntegrity(
  read: () => string = () => readFileSync(REPORT_PATH, 'utf8'),
  output: Pick<Console, 'log' | 'error'> = console,
): number {
  let check: MutationReportCheck;
  try {
    check = checkMutationReport(JSON.parse(read()));
  } catch (error) {
    output.error(
      `Could not read ${REPORT_PATH}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
  const { mutants, untested, unrecorded } = check;
  if (untested.length === 0 && unrecorded.length === 0) {
    output.log(
      `Mutation report integrity: ${mutants} mutants; every survivor ran a test.`,
    );
    return 0;
  }
  if (untested.length > 0)
    output.error(
      `${untested.length} of ${mutants} mutants survived without running a test, so the score cannot be trusted. ` +
        `Stryker's runner selected none of their covering tests; on Vitest 5 this was stryker-js#6210 (DEBT-500). ` +
        `Check the runner patch and tests/stryker-vitest-test-names.test.ts. Examples: ${examples(untested)}`,
    );
  if (unrecorded.length > 0)
    output.error(
      `${unrecorded.length} survivors have no testsCompleted count, so this check cannot tell whether they ran a test. Examples: ${examples(unrecorded)}`,
    );
  return 1;
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === executedPath) {
  process.exitCode = runMutationReportIntegrity();
}
