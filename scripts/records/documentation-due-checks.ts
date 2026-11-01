import { existsSync } from 'node:fs';
import path from 'node:path';
import { isMain } from '../lib/entry-point.mts';
import { withGhFailureReason } from '../lib/github-cli.mts';
import {
  type AlertIssueSync,
  type AlertIssues,
  createGithubAlertIssues,
  syncAlertIssue,
} from '../watchers/github-alert-issues';
import {
  addDays,
  auditRecordLifecycle,
  queueReviewDue,
  RECORDS,
  readDocumentationFiles,
} from './documentation-archive';

// Keep the existing issue title so rollout updates the same notification.
// The issue now covers dated actions in every live status and the human
// queue review that evaluates Waiting triggers and pending owner decisions.
export const DUE_CHECKS_ISSUE_TITLE =
  'Overdue production checks on Verifying records';

export type DueCheck = { file: string; due: string };

// The repository's own text, so its message is safe to print.
export class QueueReviewError extends Error {}
export type DueChecksReport = { overdue: DueCheck[]; farFuture: DueCheck[] };

function describeReport({ overdue, farFuture }: DueChecksReport): string {
  const list = (checks: DueCheck[]) =>
    checks.map(({ file, due }) => `- \`${file}\` (due ${due})\n`).join('');
  return (
    'These records have scheduled actions or checks. The README entry is the weekly human review of Waiting triggers and pending owner decisions; it is not a production verification.\n\n' +
    (overdue.length > 0 ? `**Due or overdue:**\n\n${list(overdue)}\n` : '') +
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
  // The job runs weekly, so it raises a record on its due day too.
  const result = auditRecordLifecycle(
    files,
    (file) => existsSync(path.resolve(root, file)),
    addDays(today, 1),
  );
  const report = {
    overdue: result.scheduledOverdue,
    farFuture: result.scheduledFarFuture,
  };
  const due = queueReviewDue(files.get(RECORDS.index) ?? '');
  if (!due) {
    throw new QueueReviewError(
      'Queue review due must name one valid calendar date in docs/records/README.md',
    );
  }
  // The queue review moves at most seven days at a time.
  if (due <= today) report.overdue.push({ file: RECORDS.index, due });
  else if (due > addDays(today, 7))
    report.farFuture.push({ file: RECORDS.index, due });
  return report;
}

export async function runDocumentationDueChecks(
  check: () => Promise<string>,
  output: Pick<Console, 'log' | 'error'> = console,
): Promise<number> {
  try {
    output.log(`Overdue production checks: ${await check()}`);
    return 0;
  } catch (error) {
    // Other failures can carry a GitHub credential, so only the repository's
    // own message, or gh's own error line, is printed.
    output.error(
      error instanceof QueueReviewError
        ? `Overdue production check failed: ${error.message}.`
        : withGhFailureReason(
            'Overdue production check failed; inspect the records and GitHub issue access.',
            error,
          ),
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

// No top-level await: tsx runs this repository's scripts as CommonJS.
if (isMain(import.meta.url)) {
  void runFromCommandLine(process.argv).then((code) => {
    process.exitCode = code;
  });
}
