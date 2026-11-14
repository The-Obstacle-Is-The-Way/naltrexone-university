import { readFileSync } from 'node:fs';
import { isMain } from '../lib/entry-point.mts';
import { createGhRunner, withGhFailureReason } from '../lib/github-cli.mts';
import {
  listRepositoryIssueEntries,
  repositoryOwner,
} from '../lib/github-issues.mts';

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
  return remind(issues, ISSUE_TITLE, body, 'security.txt renewal');
}

// security.txt's Contact and SECURITY.md send a researcher to GitHub's private
// report form, which works only while the repository setting is on (BUG-338).
const REPORTING_ISSUE_TITLE = 'Turn private vulnerability reporting back on';

export async function checkPrivateReporting(
  enabled: boolean,
  issues: RenewalIssues,
): Promise<'enabled' | 'created' | 'updated' | 'unchanged'> {
  if (enabled) return 'enabled';
  const body =
    'GitHub reports private vulnerability reporting as turned off for this repository. ' +
    "security.txt's Contact and SECURITY.md send researchers to its report form, which does not work while the setting is off.\n\n" +
    "Turn it back on in the repository's settings, under Private vulnerability reporting. " +
    'Then confirm that `gh api repos/{owner}/{repo}/private-vulnerability-reporting` answers `{"enabled":true}`, and close this issue.\n';
  return remind(
    issues,
    REPORTING_ISSUE_TITLE,
    body,
    'private vulnerability reporting',
  );
}

// Opens the issue with this title, or brings the one already opened up to date
// and open. Several of them need a person to consolidate.
async function remind(
  issues: RenewalIssues,
  title: string,
  body: string,
  subject: string,
): Promise<'created' | 'updated' | 'unchanged'> {
  const matching = (await issues.list()).filter(
    (issue) => issue.title === title,
  );
  if (matching.length > 1)
    throw new Error(`Multiple ${subject} issues require consolidation`);
  const existing = matching[0];
  if (!existing) {
    await issues.create(title, body);
    return 'created';
  }
  if (existing.body === body && existing.state === 'OPEN') return 'unchanged';
  await issues.update(existing.number, body);
  return 'updated';
}

const gh = createGhRunner({ timeout: 30000, maxBuffer: 32 * 1024 * 1024 });

// GitHub Actions, the reminder's author. Anyone can open an issue in this
// public repository, so only its issues are counted: a stranger's issue with
// the reminder's title can neither stop the check nor take the reminder's
// place. A local run opens the reminder as its user, which no run finds
// again, so leave the check to the monthly workflow.
const REMINDER_AUTHOR = 'github-actions[bot]';

// The assignee is required for the reason `createGithubAlertIssues` gives:
// GitHub emails no one else about an issue Actions opens (BUG-377).
export function createGithubRenewalIssues(
  assignee: string | null,
  run: typeof gh = gh,
): RenewalIssues {
  const assign = assignee ? ['--assignee', assignee] : [];
  return {
    async list() {
      const entries = listRepositoryIssueEntries(run);
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
          (issue.state !== 'open' && issue.state !== 'closed') ||
          !('user' in issue)
        ) {
          throw new Error('Invalid GitHub issue response');
        }
        // GitHub can return a null author, which is not GitHub Actions.
        if (issue.user === null) continue;
        if (
          typeof issue.user !== 'object' ||
          !('login' in issue.user) ||
          typeof issue.user.login !== 'string'
        ) {
          throw new Error('Invalid GitHub issue response');
        }
        if (issue.user.login !== REMINDER_AUTHOR) continue;
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
  };
}

// The setting is public for a public repository, so the job's issue token
// reads it; no administration permission is needed.
export function readPrivateReporting(run: typeof gh = gh): boolean {
  const response = run([
    'api',
    'repos/{owner}/{repo}/private-vulnerability-reporting',
  ]);
  let setting: unknown;
  try {
    setting = JSON.parse(response);
  } catch {
    // The parse error carries nothing the message below does not say.
    setting = undefined;
  }
  if (
    !setting ||
    typeof setting !== 'object' ||
    !('enabled' in setting) ||
    typeof setting.enabled !== 'boolean'
  ) {
    throw new Error('Invalid GitHub private vulnerability reporting response');
  }
  return setting.enabled;
}

type Output = Pick<Console, 'log' | 'error'>;

async function report(
  output: Output,
  subject: string,
  failure: string,
  check: () => Promise<string>,
): Promise<boolean> {
  try {
    output.log(`${subject}: ${await check()}`);
    return true;
  } catch (error) {
    output.error(withGhFailureReason(failure, error));
    return false;
  }
}

// Each check runs even when the other fails, so a broken security.txt cannot
// hide a reporting setting that was turned off.
export async function runSecurityTxtRenewal(
  check: () => Promise<string> = () =>
    checkSecurityTxtRenewal(
      readFileSync('public/.well-known/security.txt', 'utf8'),
      new Date(),
      createGithubRenewalIssues(repositoryOwner()),
    ),
  output: Output = console,
  checkReporting: () => Promise<string> = async () =>
    checkPrivateReporting(
      readPrivateReporting(),
      createGithubRenewalIssues(repositoryOwner()),
    ),
): Promise<number> {
  const renewal = await report(
    output,
    'security.txt renewal',
    'security.txt renewal check failed; inspect the file and GitHub issue access.',
    check,
  );
  const reporting = await report(
    output,
    'private vulnerability reporting',
    'private vulnerability reporting check failed; inspect GitHub API and issue access.',
    checkReporting,
  );
  return renewal && reporting ? 0 : 1;
}

if (isMain(import.meta.url)) {
  process.exitCode = await runSecurityTxtRenewal();
}
