import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  auditRecordLifecycle,
  readDocumentationFiles,
} from './documentation-archive';
import {
  type AlertIssueSync,
  type AlertIssues,
  createGithubAlertIssues,
  syncAlertIssue,
} from './github-alert-issues';

// A record whose fix shipped but whose final check can only happen in
// production stays live as Verifying, with a due date. A pull request must
// not fail because a calendar date passed, so this weekly job raises overdue
// and far-off checks as one GitHub issue instead, which notifies the owner.
export const DUE_CHECKS_ISSUE_TITLE =
  'Overdue production checks on Verifying records';

export type DueCheck = { file: string; due: string };
export type DueChecksReport = { overdue: DueCheck[]; farFuture: DueCheck[] };

function describeReport({ overdue, farFuture }: DueChecksReport): string {
  const list = (checks: DueCheck[]) =>
    checks.map(({ file, due }) => `- \`${file}\` (due ${due})\n`).join('');
  return (
    'These records are Verifying: their fix shipped, and a check remains that only production can satisfy.\n\n' +
    (overdue.length > 0
      ? `**Past their due date:**\n\n${list(overdue)}\n`
      : '') +
    (farFuture.length > 0
      ? `**Due more than 90 days out**, so the check may never happen:\n\n${list(farFuture)}\n`
      : '') +
    'For each one, do the check and record the result in the record, then archive it; or set a nearer due date with the reason. ' +
    'This issue closes itself once none remain. Procedure: AGENTS.md, "Register Indexes and Records".\n'
  );
}

export function reportDueChecks(
  report: DueChecksReport,
  issues: AlertIssues,
): Promise<AlertIssueSync> {
  const nothingDue =
    report.overdue.length === 0 && report.farFuture.length === 0;
  return syncAlertIssue(
    issues,
    DUE_CHECKS_ISSUE_TITLE,
    nothingDue ? null : describeReport(report),
    {
      resolved: 'No Verifying check is overdue or far off any more.',
      changed:
        'The list of Verifying checks needing attention changed; see the description.',
    },
  );
}

export function repositoryDueChecks(
  root = process.cwd(),
  today?: string,
): DueChecksReport {
  const result = auditRecordLifecycle(
    readDocumentationFiles(root),
    (file) => existsSync(path.resolve(root, file)),
    today,
  );
  return {
    overdue: result.verifyingOverdue,
    farFuture: result.verifyingFarFuture,
  };
}

export async function runDocumentationDueChecks(
  check: () => Promise<string>,
  output: Pick<Console, 'log' | 'error'> = console,
): Promise<number> {
  try {
    output.log(`Overdue production checks: ${await check()}`);
    return 0;
  } catch {
    output.error(
      'Overdue production check failed; inspect the records and GitHub issue access.',
    );
    return 1;
  }
}

// `--dry-run` reports what the job would raise without touching GitHub.
export function runFromCommandLine(
  argv: readonly string[],
  root = process.cwd(),
  output: Pick<Console, 'log' | 'error'> = console,
): Promise<number> {
  const check = argv.includes('--dry-run')
    ? async () => {
        const { overdue, farFuture } = repositoryDueChecks(root);
        return `${overdue.length} overdue, ${farFuture.length} far off (dry run; no issue touched)`;
      }
    : () =>
        reportDueChecks(repositoryDueChecks(root), createGithubAlertIssues());
  return runDocumentationDueChecks(check, output);
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
// No top-level await: tsx runs this repository's scripts as CommonJS.
if (import.meta.url === executedPath) {
  void runFromCommandLine(process.argv).then((code) => {
    process.exitCode = code;
  });
}
