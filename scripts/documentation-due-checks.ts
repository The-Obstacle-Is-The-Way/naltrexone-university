import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  auditRecordLifecycle,
  RECORDS,
  readDocumentationFiles,
} from './documentation-archive';
import {
  type AlertIssueSync,
  type AlertIssues,
  createGithubAlertIssues,
  syncAlertIssue,
} from './github-alert-issues';

// Keep the existing issue title so rollout updates the same notification.
// The issue now covers dated actions in every live status and the human
// queue review that evaluates Waiting triggers and pending owner decisions.
export const DUE_CHECKS_ISSUE_TITLE =
  'Overdue production checks on Verifying records';

export type DueCheck = { file: string; due: string };
export type DueChecksReport = { overdue: DueCheck[]; farFuture: DueCheck[] };

function describeReport({ overdue, farFuture }: DueChecksReport): string {
  const list = (checks: DueCheck[]) =>
    checks.map(({ file, due }) => `- \`${file}\` (due ${due})\n`).join('');
  return (
    'These records have scheduled actions or checks. The README entry is the weekly human review of Waiting triggers and pending owner decisions; it is not a production verification.\n\n' +
    (overdue.length > 0
      ? `**Past their due date:**\n\n${list(overdue)}\n`
      : '') +
    (farFuture.length > 0
      ? `**Due more than 90 days out**, so the check may never happen:\n\n${list(farFuture)}\n`
      : '') +
    'For each record, do the named action and record its outcome; close only after all required checks pass. For the README, review every Waiting trigger and owner decision, record the outcome in the closing PR description, update Now, then move Queue review due forward by at most seven days. Do not move dates merely to dismiss this issue. ' +
    'This issue closes itself once none remain. Procedure: docs/records/README.md, "How Records Work".\n'
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
      resolved: 'No scheduled record check or queue review needs attention.',
      changed:
        'The documentation checks needing attention changed; see the description.',
    },
  );
}

export function repositoryDueChecks(
  root = process.cwd(),
  today = new Date().toISOString().slice(0, 10),
): DueChecksReport {
  const files = readDocumentationFiles(root);
  const result = auditRecordLifecycle(
    files,
    (file) => existsSync(path.resolve(root, file)),
    today,
  );
  const report = {
    overdue: result.scheduledOverdue,
    farFuture: result.scheduledFarFuture,
  };
  const dates = [
    ...(files.get(RECORDS.index) ?? '').matchAll(
      /^\*\*Queue review due:\*\* (\d{4}-\d{2}-\d{2})$/gm,
    ),
  ];
  const due = dates[0]?.[1];
  const date = new Date(`${due}T00:00:00Z`);
  if (
    dates.length !== 1 ||
    !due ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== due
  ) {
    throw new Error(
      'Queue review due must name one valid calendar date in docs/records/README.md',
    );
  }
  const horizon = new Date(`${today}T00:00:00Z`);
  const horizonDays = 90;
  horizon.setUTCDate(horizon.getUTCDate() + horizonDays);
  if (due <= today) report.overdue.push({ file: RECORDS.index, due });
  else if (date > horizon) report.farFuture.push({ file: RECORDS.index, due });
  return report;
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
