import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ISSUE_TITLE = 'Renew security.txt contact metadata';
const RENEWAL_WINDOW_MS = 90 * 24 * 60 * 60 * 1_000;

export type RenewalIssue = {
  number: number;
  title: string;
  body: string;
  state: 'OPEN' | 'CLOSED';
};

export type RenewalIssues = {
  list(): Promise<RenewalIssue[]>;
  create(title: string, body: string): Promise<void>;
  update(number: number, body: string): Promise<void>;
};

export async function checkSecurityTxtRenewal(
  contents: string,
  now: Date,
  issues: RenewalIssues,
): Promise<'not-due' | 'created' | 'updated' | 'unchanged'> {
  const timestamps = [...contents.matchAll(/^Expires:\s*(.+)$/gim)];
  const expires = timestamps[0]?.[1]?.trim() ?? '';
  const expiresAt = Date.parse(expires);
  if (
    timestamps.length !== 1 ||
    !Number.isFinite(expiresAt) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(
      expires,
    ) ||
    // Date.parse normalizes February 30 and 24:00; round-trip local components
    // independently of the offset so valid timezone crossings remain valid.
    new Date(`${expires.slice(0, 19).toUpperCase()}Z`)
      .toISOString()
      .slice(0, 19) !== expires.slice(0, 19).toUpperCase()
  ) {
    throw new Error('Expected one valid security.txt Expires timestamp');
  }
  if (!Number.isFinite(now.getTime()))
    throw new Error('Invalid renewal check date');
  if (expiresAt - now.getTime() >= RENEWAL_WINDOW_MS) return 'not-due';

  const body =
    `The security.txt Expires timestamp is ${expires}.\n\n` +
    'Before renewing, re-verify the contact and policy links in public/.well-known/security.txt. ' +
    'Then set Expires to less than one year after the verification date, per [RFC 9116 §2.5.5](https://www.rfc-editor.org/rfc/rfc9116.html#section-2.5.5). ' +
    'Record the verification date and close this issue after the updated file is deployed. ' +
    'The hard future-expiry test remains mandatory.\n';
  const matching = (await issues.list()).filter(
    (issue) => issue.title === ISSUE_TITLE,
  );
  if (matching.length > 1)
    throw new Error(
      'Multiple security.txt renewal issues require consolidation',
    );
  const existing = matching[0];
  if (!existing) {
    await issues.create(ISSUE_TITLE, body);
    return 'created';
  }
  if (existing.body === body && existing.state === 'OPEN') return 'unchanged';
  await issues.update(existing.number, body);
  return 'updated';
}

function gh(args: string[]): string {
  // Credentials come only from the workflow's scoped GH_TOKEN; never log them.
  return execFileSync('gh', args, {
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 32 * 1024 * 1024,
  });
}

export function createGithubRenewalIssues(run: typeof gh = gh): RenewalIssues {
  return {
    async list() {
      const pages: unknown = JSON.parse(
        run([
          'api',
          '--paginate',
          '--slurp',
          'repos/{owner}/{repo}/issues?state=all&per_page=100',
        ]),
      );
      if (!Array.isArray(pages) || !pages.every(Array.isArray)) {
        throw new Error('Invalid GitHub issue response');
      }
      const entries: unknown[] = pages.flat();
      const issues: RenewalIssue[] = [];
      for (const issue of entries) {
        if (!issue || typeof issue !== 'object' || Array.isArray(issue)) {
          throw new Error('Invalid GitHub issue response');
        }
        // Pull requests share this endpoint, but their fields are not consumed.
        if ('pull_request' in issue) {
          if (
            !issue.pull_request ||
            typeof issue.pull_request !== 'object' ||
            Array.isArray(issue.pull_request)
          ) {
            throw new Error('Invalid GitHub issue response');
          }
          continue;
        }
        if (
          !('number' in issue) ||
          typeof issue.number !== 'number' ||
          !Number.isSafeInteger(issue.number) ||
          issue.number <= 0 ||
          !('title' in issue) ||
          typeof issue.title !== 'string' ||
          !('body' in issue) ||
          (issue.body !== null && typeof issue.body !== 'string') ||
          !('state' in issue) ||
          (issue.state !== 'open' && issue.state !== 'closed')
        ) {
          throw new Error('Invalid GitHub issue response');
        }
        issues.push({
          number: issue.number,
          title: issue.title,
          body: issue.body ?? '',
          state: issue.state === 'open' ? 'OPEN' : 'CLOSED',
        });
      }
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
  };
}

export async function runSecurityTxtRenewal(
  check = () =>
    checkSecurityTxtRenewal(
      readFileSync('public/.well-known/security.txt', 'utf8'),
      new Date(),
      createGithubRenewalIssues(),
    ),
  output: Pick<Console, 'log' | 'error'> = console,
): Promise<number> {
  try {
    output.log(`security.txt renewal: ${await check()}`);
    return 0;
  } catch {
    output.error(
      'security.txt renewal check failed; inspect the file and GitHub issue access.',
    );
    return 1;
  }
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === executedPath) {
  process.exitCode = await runSecurityTxtRenewal();
}
