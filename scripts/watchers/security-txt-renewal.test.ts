import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { withRecordedCli } from '../../tests/shared/recorded-cli';
import { ghRunnerFailure } from '../lib/github-cli-test-helpers';
import {
  checkPrivateReporting,
  checkSecurityTxtRenewal,
  createGithubRenewalIssues,
  type RenewalIssue,
  type RenewalIssues,
  readPrivateReporting,
  runSecurityTxtRenewal,
} from './security-txt-renewal.mjs';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

class MemoryIssues implements RenewalIssues {
  issues: RenewalIssue[] = [];
  writes = 0;
  async list() {
    return this.issues;
  }
  async create(title: string, body: string) {
    this.issues.push({
      number: this.issues.length + 1,
      title,
      body,
      state: 'OPEN',
    });
    this.writes++;
  }
  async update(number: number, body: string) {
    const issue = this.issues.find((entry) => entry.number === number);
    if (!issue) throw new Error('Missing fixture issue');
    issue.body = body;
    issue.state = 'OPEN';
    this.writes++;
  }
}

const now = new Date('2026-09-20T00:00:00Z');
const document = (days: number) =>
  `Expires: ${new Date(now.getTime() + days * 86_400_000).toISOString()}\n`;

describe('security.txt renewal reminder', () => {
  it.each(['expires', 'eXpIrEs'])(
    'accepts the RFC case-insensitive field name %s',
    async (field) => {
      expect(
        await checkSecurityTxtRenewal(
          document(91).replace('Expires', field),
          now,
          new MemoryIssues(),
        ),
      ).toBe('not-due');
    },
  );

  it('accepts a real leap day', async () => {
    expect(
      await checkSecurityTxtRenewal(
        'Expires: 2028-02-29T01:00:00+01:00',
        now,
        new MemoryIssues(),
      ),
    ).toBe('not-due');
  });

  it.each([90, 91, 365])(
    'does nothing with %s days remaining',
    async (days) => {
      const issues = new MemoryIssues();
      expect(await checkSecurityTxtRenewal(document(days), now, issues)).toBe(
        'not-due',
      );
      expect(issues.writes).toBe(0);
    },
  );

  it.each([89, 0, -1])(
    'opens a renewal issue with %s days remaining',
    async (days) => {
      const issues = new MemoryIssues();
      expect(await checkSecurityTxtRenewal(document(days), now, issues)).toBe(
        'created',
      );
      expect(issues.issues).toHaveLength(1);
      expect(issues.issues[0]?.body).toContain(
        're-verify the contact and policy links',
      );
      expect(issues.issues[0]?.body).toContain(
        'less than one year after the verification date',
      );
    },
  );

  it('reuses the same issue across repeated checks and later renewal cycles', async () => {
    const issues = new MemoryIssues();
    await checkSecurityTxtRenewal(document(89), now, issues);
    await checkSecurityTxtRenewal(document(89), now, issues);
    expect(issues.writes).toBe(1);
    const issue = issues.issues[0];
    if (!issue) throw new Error('Missing fixture issue');
    issue.state = 'CLOSED';
    expect(await checkSecurityTxtRenewal(document(80), now, issues)).toBe(
      'updated',
    );
    expect(issues.issues).toHaveLength(1);
    expect(issue.state).toBe('OPEN');
    expect(issue.body).toContain(
      new Date(now.getTime() + 80 * 86_400_000).toISOString(),
    );
  });

  it.each([
    '',
    'Expires: invalid',
    'Expires: 2026-13-01T00:00:00Z',
    'Expires: 2024-02-30T00:00:00Z',
    'Expires: 2027-02-29T01:00:00+01:00',
    'Expires: 2027-04-31T00:00:00Z',
    'Expires: 2027-01-31T24:00:00Z',
    `${document(10)}${document(20)}`,
    `${document(10)}${document(20).replace('Expires', 'expires')}`,
  ])(
    'rejects malformed expiry %j before writing an issue',
    async (contents) => {
      const issues = new MemoryIssues();
      await expect(
        checkSecurityTxtRenewal(contents, now, issues),
      ).rejects.toThrow('Expected one valid security.txt Expires timestamp');
      expect(issues.writes).toBe(0);
    },
  );

  it('propagates an issue API failure instead of reporting a delivered reminder', async () => {
    const issues = new MemoryIssues();
    issues.create = async () => {
      throw new Error('API unavailable');
    };
    await expect(
      checkSecurityTxtRenewal(document(10), now, issues),
    ).rejects.toThrow('API unavailable');
  });

  it('refuses duplicate reminder issues without writing another', async () => {
    const issues = new MemoryIssues();
    await checkSecurityTxtRenewal(document(10), now, issues);
    const first = issues.issues[0];
    if (!first) throw new Error('Missing fixture issue');
    issues.issues.push({ ...first, number: 2 });
    await expect(
      checkSecurityTxtRenewal(document(10), now, issues),
    ).rejects.toThrow(
      'Multiple security.txt renewal issues require consolidation',
    );
    expect(issues.writes).toBe(1);
  });

  it('rejects an invalid check date instead of publishing a misleading reminder', async () => {
    await expect(
      checkSecurityTxtRenewal(
        document(10),
        new Date('invalid'),
        new MemoryIssues(),
      ),
    ).rejects.toThrow('Invalid renewal check date');
  });
});

// security.txt and SECURITY.md send a researcher to GitHub's private report
// form, which works only while the repository setting is on (BUG-338).
describe('private vulnerability reporting check', () => {
  const REPORTING_TITLE = 'Turn private vulnerability reporting back on';

  it('writes no issue while reporting is on', async () => {
    const issues = new MemoryIssues();
    expect(await checkPrivateReporting(true, issues)).toBe('enabled');
    expect(issues.issues).toEqual([]);
  });

  it('opens one issue when reporting is off, reuses it, and reopens it once closed', async () => {
    const issues = new MemoryIssues();
    expect(await checkPrivateReporting(false, issues)).toBe('created');
    expect(await checkPrivateReporting(false, issues)).toBe('unchanged');
    const issue = issues.issues[0];
    if (!issue) throw new Error('Missing reporting issue');
    expect(issue.title).toBe(REPORTING_TITLE);
    expect(issue.body).toContain('private-vulnerability-reporting');
    issue.state = 'CLOSED';
    expect(await checkPrivateReporting(false, issues)).toBe('updated');
    expect(issues.issues).toEqual([{ ...issue, state: 'OPEN' }]);
  });

  it('keeps its issue apart from the renewal reminder', async () => {
    const issues = new MemoryIssues();
    await checkSecurityTxtRenewal(document(89), now, issues);
    expect(await checkPrivateReporting(false, issues)).toBe('created');
    expect(issues.issues.map((issue) => issue.title)).toEqual([
      'Renew security.txt contact metadata',
      REPORTING_TITLE,
    ]);
  });

  it('reads the setting from the repository API', () => {
    const commands: string[][] = [];
    expect(
      readPrivateReporting((args) => {
        commands.push(args);
        return '{"enabled":false}';
      }),
    ).toBe(false);
    expect(commands).toEqual([
      ['api', 'repos/{owner}/{repo}/private-vulnerability-reporting'],
    ]);
  });

  it.each(['{}', '{"enabled":"true"}', 'null', 'not json'])(
    'rejects the response %s instead of guessing the setting',
    (response) => {
      expect(() => readPrivateReporting(() => response)).toThrow(
        'Invalid GitHub private vulnerability reporting response',
      );
    },
  );
});

describe('renewal command outcome', () => {
  it('reads the repository file, and from GitHub only the reporting setting, when renewal is not due', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2000-01-01T00:00:00Z'));
    const messages: string[] = [];
    const output = {
      log: (message: string) => messages.push(message),
      error: () => {
        throw new Error('Unexpected error output');
      },
    };
    await withRecordedCli('gh', '{"enabled":true}', async (calls) => {
      expect(await runSecurityTxtRenewal(undefined, output)).toBe(0);
      expect(messages).toEqual([
        'security.txt renewal: not-due',
        'private vulnerability reporting: enabled',
      ]);
      expect(calls()).toEqual([
        ['api', 'repos/{owner}/{repo}/private-vulnerability-reporting'],
      ]);
    });
  });

  it('checks the reporting setting even when the renewal check fails, and reports each failure', async () => {
    const messages: string[] = [];
    const errors: string[] = [];
    const output = {
      log: (message: string) => messages.push(message),
      error: (message: string) => errors.push(message),
    };
    expect(
      await runSecurityTxtRenewal(
        async () => {
          throw new Error('private fixture detail');
        },
        output,
        async () => {
          throw new Error('private fixture detail');
        },
      ),
    ).toBe(1);
    expect(messages).toEqual([]);
    expect(errors).toEqual([
      'security.txt renewal check failed; inspect the file and GitHub issue access.',
      'private vulnerability reporting check failed; inspect GitHub API and issue access.',
    ]);
  });

  it('returns nonzero when only the reporting check fails', async () => {
    const messages: string[] = [];
    const errors: string[] = [];
    const output = {
      log: (message: string) => messages.push(message),
      error: (message: string) => errors.push(message),
    };
    expect(
      await runSecurityTxtRenewal(
        async () => 'not-due',
        output,
        async () => {
          throw new Error('private fixture detail');
        },
      ),
    ).toBe(1);
    expect(messages).toEqual(['security.txt renewal: not-due']);
    expect(errors).toEqual([
      'private vulnerability reporting check failed; inspect GitHub API and issue access.',
    ]);
  });

  it('reports the completed outcome and returns zero', async () => {
    const messages: string[] = [];
    const output = {
      log: (message: string) => messages.push(message),
      error: () => {
        throw new Error('Unexpected error output');
      },
    };
    const issues = new MemoryIssues();
    expect(
      await runSecurityTxtRenewal(
        () => checkSecurityTxtRenewal(document(89), now, issues),
        output,
        () => checkPrivateReporting(true, issues),
      ),
    ).toBe(0);
    expect(messages).toEqual([
      'security.txt renewal: created',
      'private vulnerability reporting: enabled',
    ]);
  });

  it('adds gh’s own line when a gh call fails', async () => {
    const errors: string[] = [];
    const output = {
      log: () => {},
      error: (message: string) => errors.push(message),
    };
    const failure = await ghRunnerFailure(
      'GraphQL: Resource not accessible by integration (createIssue)\n',
    );
    expect(
      await runSecurityTxtRenewal(
        async () => {
          throw failure;
        },
        output,
        async () => 'enabled',
      ),
    ).toBe(1);
    expect(errors).toEqual([
      'security.txt renewal check failed; inspect the file and GitHub issue access. Cause: GraphQL: Resource not accessible by integration (createIssue)',
    ]);
  });
});

// The account GitHub Actions opens issues as.
const ACTIONS = { login: 'github-actions[bot]' };

describe('renewal workflow', () => {
  // Anyone can open an issue in this public repository, with any title.
  describe("a stranger's issue with the reminder's title", () => {
    const reminder = (number: number, login: string) => ({
      number,
      title: 'Renew security.txt contact metadata',
      body: 'Old guidance',
      state: 'open',
      user: { login },
    });
    const adapter = (entries: object[]) => {
      const commands: string[][] = [];
      const issues = createGithubRenewalIssues(null, (args) => {
        commands.push(args);
        return args[1] === '--paginate' ? JSON.stringify([entries]) : '';
      });
      return { commands, issues };
    };

    it('cannot stop the check by making the reminder ambiguous', async () => {
      const { commands, issues } = adapter([
        reminder(42, ACTIONS.login),
        reminder(43, 'stranger'),
      ]);

      expect(await checkSecurityTxtRenewal(document(10), now, issues)).toBe(
        'updated',
      );
      expect(commands[1]).toContain('repos/{owner}/{repo}/issues/42');
    });

    // GitHub can return a null author; it is not GitHub Actions, so skip it.
    it('skips an issue with a null author instead of aborting the check', async () => {
      const { commands, issues } = adapter([
        reminder(42, ACTIONS.login),
        { ...reminder(43, 'stranger'), user: null },
      ]);

      expect(await checkSecurityTxtRenewal(document(10), now, issues)).toBe(
        'updated',
      );
      expect(commands[1]).toContain('repos/{owner}/{repo}/issues/42');
    });

    it("cannot take the reminder's place", async () => {
      const { commands, issues } = adapter([reminder(43, 'stranger')]);

      expect(await checkSecurityTxtRenewal(document(10), now, issues)).toBe(
        'created',
      );
      expect(commands[1]?.slice(0, 2)).toEqual(['issue', 'create']);
    });
  });

  it.each([
    { number: -1 },
    { number: 1.5 },
    { number: Number.MAX_SAFE_INTEGER + 1 },
    { title: null },
    { state: 'unknown' },
    { body: 42 },
    { user: undefined },
    { user: { login: 7 } },
    { pull_request: true },
  ])('refuses malformed issue fields %j before writing', async (overrides) => {
    const commands: string[][] = [];
    const issues = createGithubRenewalIssues(null, (args) => {
      commands.push(args);
      return JSON.stringify([
        [
          {
            number: 42,
            title: 'Renew security.txt contact metadata',
            body: null,
            state: 'open',
            user: ACTIONS,
            ...overrides,
          },
        ],
      ]);
    });
    await expect(
      checkSecurityTxtRenewal(document(10), now, issues),
    ).rejects.toThrow('Invalid GitHub issue response');
    expect(commands).toHaveLength(1);
  });

  it.each([{}, [null], [{}], [[null]]].map((data) => ({ data })))(
    'refuses malformed page data $data',
    async ({ data }) => {
      const issues = createGithubRenewalIssues(null, () =>
        JSON.stringify(data),
      );
      await expect(issues.list()).rejects.toThrow(
        'Invalid GitHub issue response',
      );
    },
  );

  it('accepts a null issue body without inventing content', async () => {
    const issues = createGithubRenewalIssues(null, () =>
      JSON.stringify([
        [
          {
            number: 42,
            title: 'Reminder',
            body: null,
            state: 'open',
            user: ACTIONS,
          },
        ],
      ]),
    );
    expect(await issues.list()).toEqual([
      { number: 42, title: 'Reminder', body: '', state: 'OPEN' },
    ]);
  });

  it('executes the default GitHub adapter with the intended arguments', async () => {
    await withRecordedCli('gh', '', async (calls) => {
      await createGithubRenewalIssues(null).create(
        'Reminder',
        'Renewal guidance',
      );
      expect(calls()).toEqual([
        [
          'issue',
          'create',
          '--title',
          'Reminder',
          '--body',
          'Renewal guidance',
        ],
      ]);
    });
  });

  // BUG-377: GitHub emails nobody else about an issue Actions opens.
  it('assigns created and reopened reminders to the given assignee, whom GitHub notifies whatever their watch setting', async () => {
    const commands: string[][] = [];
    const issues = createGithubRenewalIssues('repo-owner', (args) => {
      commands.push(args);
      return '';
    });

    await issues.create('Reminder', 'Renewal guidance');
    await issues.update(42, 'Renewal guidance');

    expect(commands).toEqual([
      [
        'issue',
        'create',
        '--title',
        'Reminder',
        '--body',
        'Renewal guidance',
        '--assignee',
        'repo-owner',
      ],
      [
        'api',
        '--method',
        'PATCH',
        'repos/{owner}/{repo}/issues/42',
        '-f',
        'state=open',
        '-f',
        'body=Renewal guidance',
        '-f',
        'assignees[]=repo-owner',
      ],
    ]);
  });

  it('assigns the scheduled run’s reminder to the repository owner that Actions names', async () => {
    const expires = readFileSync(
      'public/.well-known/security.txt',
      'utf8',
    ).match(/^Expires:\s*(.+)$/m)?.[1];
    vi.useFakeTimers();
    // A day before the committed file expires, inside its renewal window.
    vi.setSystemTime(Date.parse(expires ?? '') - 24 * 60 * 60 * 1_000);
    vi.stubEnv('GITHUB_REPOSITORY_OWNER', 'repo-owner');
    const output = { log: () => {}, error: () => {} };

    await withRecordedCli('gh', '[[]]', async (calls) => {
      await runSecurityTxtRenewal(undefined, output);
      const created = calls().find((args) => args[1] === 'create');
      expect(created?.slice(-2)).toEqual(['--assignee', 'repo-owner']);
    });
  });

  it('looks up existing issues directly with pagination instead of the eventually consistent search index', async () => {
    const commands: string[][] = [];
    const issues = createGithubRenewalIssues(null, (args) => {
      commands.push(args);
      return JSON.stringify([
        [
          {
            number: 42,
            title: 'Reminder',
            body: 'text',
            state: 'closed',
            user: ACTIONS,
          },
        ],
        [{ number: 43, title: 'PR', state: 'open', pull_request: {} }],
      ]);
    });
    expect(await issues.list()).toEqual([
      { number: 42, title: 'Reminder', body: 'text', state: 'CLOSED' },
    ]);
    expect(commands[0]?.slice(0, 4)).toEqual([
      'api',
      '--paginate',
      '--slurp',
      'repos/{owner}/{repo}/issues?state=all&per_page=100',
    ]);
    expect(commands[0]).not.toContain('--jq');
  });

  it('updates body and open state atomically without reopening an already-open issue', async () => {
    const commands: string[][] = [];
    const issues = createGithubRenewalIssues(null, (args) => {
      commands.push(args);
      return '';
    });
    await issues.update(42, 'Renewal guidance');
    expect(commands).toEqual([
      [
        'api',
        '--method',
        'PATCH',
        'repos/{owner}/{repo}/issues/42',
        '-f',
        'state=open',
        '-f',
        'body=Renewal guidance',
      ],
    ]);
  });

  it('runs monthly with serialized issue writes and only the needed token scope', () => {
    const workflow = parse(
      readFileSync('.github/workflows/security-txt-renewal.yml', 'utf8'),
    );
    expect(workflow.on).toEqual({
      schedule: [{ cron: '11 7 1 * *' }],
      workflow_dispatch: null,
    });
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(workflow.concurrency).toEqual({
      group: 'security-txt-renewal',
      'cancel-in-progress': false,
    });
    expect(workflow.jobs.renewal.permissions).toEqual({
      contents: 'read',
      issues: 'write',
    });
    expect(workflow.jobs.renewal['timeout-minutes']).toBe(5);
    for (const step of workflow.jobs.renewal.steps) {
      if (step.uses) expect(step.uses).toMatch(/@[a-f0-9]{40}$/);
    }
    expect(workflow.jobs.renewal.steps.at(-1)).toMatchObject({
      run: 'node scripts/watchers/security-txt-renewal.mts',
      env: {
        GH_TOKEN: `${'$'}{{ github.token }}`,
        GH_REPO: `${'$'}{{ github.repository }}`,
      },
    });
  });
});
