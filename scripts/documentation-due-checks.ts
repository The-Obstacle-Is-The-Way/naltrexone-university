import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  auditRecordLifecycle,
  readDocumentationFiles,
} from './documentation-archive';
// The renewal reminder's issue adapter is generic: list, create, update.
import {
  createGithubRenewalIssues,
  type RenewalIssues,
} from './security-txt-renewal';

// A record whose fix shipped but whose final check can only happen in
// production stays live as Verifying, with a due date. A pull request must
// not fail because a calendar date passed, so this weekly job raises overdue
// checks as one GitHub issue instead, which notifies the owner.
export const DUE_CHECKS_ISSUE_TITLE =
  'Overdue production checks on Verifying records';

export type OverdueCheck = { file: string; due: string };

export async function reportOverdueChecks(
  overdue: readonly OverdueCheck[],
  issues: RenewalIssues,
): Promise<'none' | 'created' | 'updated' | 'unchanged'> {
  if (overdue.length === 0) return 'none';
  const body =
    'These records are Verifying: their fix shipped, and a check that can only happen in production is past its due date.\n\n' +
    overdue.map(({ file, due }) => `- \`${file}\` (due ${due})\n`).join('') +
    '\nFor each one, do the check and record the result in the record. Then archive it, or set a new due date with the reason. ' +
    'Close this issue when none remain. Procedure: AGENTS.md, "Closing and Archiving Documentation Records".\n';
  const matching = (await issues.list()).filter(
    (issue) => issue.title === DUE_CHECKS_ISSUE_TITLE,
  );
  if (matching.length > 1)
    throw new Error('Multiple overdue-check issues require consolidation');
  const existing = matching[0];
  if (!existing) {
    await issues.create(DUE_CHECKS_ISSUE_TITLE, body);
    return 'created';
  }
  if (existing.body === body && existing.state === 'OPEN') return 'unchanged';
  await issues.update(existing.number, body);
  return 'updated';
}

export function repositoryOverdueChecks(
  root = process.cwd(),
  today?: string,
): OverdueCheck[] {
  return auditRecordLifecycle(
    readDocumentationFiles(root),
    (file) => existsSync(path.resolve(root, file)),
    today,
  ).verifyingOverdue;
}

export async function runDocumentationDueChecks(
  check = () =>
    reportOverdueChecks(repositoryOverdueChecks(), createGithubRenewalIssues()),
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

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === executedPath) {
  process.exitCode = await runDocumentationDueChecks();
}
