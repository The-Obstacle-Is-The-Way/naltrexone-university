import { execFileSync } from 'node:child_process';

// A scheduled job that finds something the owner must act on raises it as one
// GitHub issue, which notifies them. The issue's title identifies the alert:
// the job opens it, keeps its description current, and closes it once the
// condition clears.
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

export type AlertIssueSync =
  | 'none'
  | 'created'
  | 'updated'
  | 'unchanged'
  | 'closed';

export type AlertIssueMessages = {
  /** The comment that closes the issue once the condition clears. */
  resolved: string;
  /** The comment posted when the description changes. */
  changed: string;
};

// `body` is the issue's description while the condition holds, and null once
// it clears.
export async function syncAlertIssue(
  issues: AlertIssues,
  title: string,
  body: string | null,
  messages: AlertIssueMessages,
): Promise<AlertIssueSync> {
  // The search matches words, so compare the exact title here.
  const matching = (await issues.find(title)).filter(
    (issue) => issue.title === title,
  );
  if (matching.length > 1)
    throw new Error(`Multiple "${title}" issues require consolidation`);
  const existing = matching[0];
  if (body === null) {
    if (existing?.state !== 'OPEN') return 'none';
    await issues.close(existing.number, messages.resolved);
    return 'closed';
  }
  if (!existing) {
    await issues.create(title, body);
    return 'created';
  }
  if (existing.body === body && existing.state === 'OPEN') return 'unchanged';
  await issues.update(existing.number, body);
  // An edited description notifies nobody; a comment does.
  await issues.comment(existing.number, messages.changed);
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

// GitHub notifies an assignee whatever their watch setting, so a job whose
// issue must reach the owner passes the repository owner here (DEBT-515).
export function createGithubAlertIssues(
  run: typeof gh = gh,
  assignee: string | null = null,
): AlertIssues {
  const assign = assignee ? ['--assignee', assignee] : [];
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
      run(['issue', 'create', '--title', title, '--body', body, ...assign]);
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
        ...(assignee ? ['-f', `assignees[]=${assignee}`] : []),
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
