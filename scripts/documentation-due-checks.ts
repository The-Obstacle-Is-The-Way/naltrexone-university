import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  auditRecordLifecycle,
  readDocumentationFiles,
} from './documentation-archive';

// A record whose fix shipped but whose final check can only happen in
// production stays live as Verifying, with a due date. A pull request must
// not fail because a calendar date passed, so this weekly job raises overdue
// and far-off checks as one GitHub issue instead, which notifies the owner.
export const DUE_CHECKS_ISSUE_TITLE =
  'Overdue production checks on Verifying records';

export type DueCheck = { file: string; due: string };
export type DueChecksReport = { overdue: DueCheck[]; farFuture: DueCheck[] };

export type AlertIssue = {
  number: number;
  title: string;
  body: string;
  state: 'OPEN' | 'CLOSED';
};

export type AlertIssues = {
  find(title: string): Promise<AlertIssue[]>;
  create(title: string, body: string): Promise<void>;
  // Replaces the description and reopens the issue.
  update(number: number, body: string): Promise<void>;
  comment(number: number, body: string): Promise<void>;
  close(number: number, comment: string): Promise<void>;
};

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

export async function reportDueChecks(
  report: DueChecksReport,
  issues: AlertIssues,
): Promise<'none' | 'created' | 'updated' | 'unchanged' | 'closed'> {
  // The search matches words, so compare the exact title here.
  const matching = (await issues.find(DUE_CHECKS_ISSUE_TITLE)).filter(
    (issue) => issue.title === DUE_CHECKS_ISSUE_TITLE,
  );
  if (matching.length > 1)
    throw new Error('Multiple overdue-check issues require consolidation');
  const existing = matching[0];
  if (report.overdue.length === 0 && report.farFuture.length === 0) {
    if (existing?.state !== 'OPEN') return 'none';
    await issues.close(
      existing.number,
      'No Verifying check is overdue or far off any more.',
    );
    return 'closed';
  }
  const body = describeReport(report);
  if (!existing) {
    await issues.create(DUE_CHECKS_ISSUE_TITLE, body);
    return 'created';
  }
  if (existing.body === body && existing.state === 'OPEN') return 'unchanged';
  await issues.update(existing.number, body);
  // An edited description notifies nobody; a comment does.
  await issues.comment(
    existing.number,
    'The list of Verifying checks needing attention changed; see the description.',
  );
  return 'updated';
}

function gh(args: string[]): string {
  // Credentials come only from the workflow's scoped GH_TOKEN; never log them.
  return execFileSync('gh', args, {
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
  });
}

// The search returns at most this many issues. Reaching it means the
// existing alert may have been left out, so the job fails rather than
// opening a duplicate.
const SEARCH_LIMIT = 100;

function parseIssues(json: string): AlertIssue[] {
  const entries: unknown = JSON.parse(json);
  if (!Array.isArray(entries)) throw new Error('Invalid GitHub issue response');
  return entries.map((issue: unknown) => {
    if (
      !issue ||
      typeof issue !== 'object' ||
      !('number' in issue) ||
      typeof issue.number !== 'number' ||
      !('title' in issue) ||
      typeof issue.title !== 'string' ||
      !('body' in issue) ||
      (issue.body !== null && typeof issue.body !== 'string') ||
      !('state' in issue) ||
      (issue.state !== 'OPEN' && issue.state !== 'CLOSED')
    )
      throw new Error('Invalid GitHub issue response');
    return {
      number: issue.number,
      title: issue.title,
      body: issue.body ?? '',
      state: issue.state,
    };
  });
}

export function createGithubAlertIssues(run: typeof gh = gh): AlertIssues {
  return {
    // A server-side title search, so the job does not grow with the
    // repository's issue and pull-request count.
    async find(title) {
      const issues = parseIssues(
        run([
          'issue',
          'list',
          '--state',
          'all',
          '--search',
          `in:title "${title}"`,
          '--json',
          'number,title,body,state',
          '--limit',
          String(SEARCH_LIMIT),
        ]),
      );
      if (issues.length >= SEARCH_LIMIT)
        throw new Error('Too many matching issues to find the alert safely');
      return issues;
    },
    async create(title, body) {
      run(['issue', 'create', '--title', title, '--body', body]);
    },
    async update(number, body) {
      run([
        'api',
        '--method',
        'PATCH',
        `repos/{owner}/{repo}/issues/${number}`,
        '-f',
        'state=open',
        '-f',
        `body=${body}`,
      ]);
    },
    async comment(number, body) {
      run(['issue', 'comment', String(number), '--body', body]);
    },
    async close(number, comment) {
      run(['issue', 'close', String(number), '--comment', comment]);
    },
  };
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
