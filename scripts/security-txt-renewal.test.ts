import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import {
  checkSecurityTxtRenewal,
  createGithubRenewalIssues,
  type RenewalIssue,
  type RenewalIssues,
  runSecurityTxtRenewal,
} from './security-txt-renewal';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

afterEach(() => {
  vi.useRealTimers();
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
    `${document(10)}${document(20)}`,
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

describe('renewal command outcome', () => {
  it('reads the repository file without using GitHub when renewal is not due', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2000-01-01T00:00:00Z'));
    const messages: string[] = [];
    const output = {
      log: (message: string) => messages.push(message),
      error: () => {
        throw new Error('Unexpected error output');
      },
    };
    expect(await runSecurityTxtRenewal(undefined, output)).toBe(0);
    expect(messages).toEqual(['security.txt renewal: not-due']);
    expect(execFileSync).not.toHaveBeenCalled();
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
      ),
    ).toBe(0);
    expect(messages).toEqual(['security.txt renewal: created']);
  });

  it('returns nonzero with value-free diagnostics when the check fails', async () => {
    const errors: string[] = [];
    const output = {
      log: () => {
        throw new Error('Unexpected success output');
      },
      error: (message: string) => errors.push(message),
    };
    expect(
      await runSecurityTxtRenewal(async () => {
        throw new Error('private fixture detail');
      }, output),
    ).toBe(1);
    expect(errors).toEqual([
      'security.txt renewal check failed; inspect the file and GitHub issue access.',
    ]);
  });
});

describe('renewal workflow', () => {
  it('executes the default GitHub adapter with a bounded credential-free argument list', async () => {
    const run = vi.mocked(execFileSync).mockReturnValue('');
    await createGithubRenewalIssues().create('Reminder', 'Renewal guidance');
    expect(run).toHaveBeenCalledWith(
      'gh',
      ['issue', 'create', '--title', 'Reminder', '--body', 'Renewal guidance'],
      {
        encoding: 'utf8',
        timeout: 30_000,
        maxBuffer: 32 * 1024 * 1024,
      },
    );
  });

  it('looks up existing issues directly with pagination instead of the eventually consistent search index', async () => {
    const commands: string[][] = [];
    const issues = createGithubRenewalIssues((args) => {
      commands.push(args);
      return JSON.stringify([
        [{ number: 42, title: 'Reminder', body: 'text', state: 'closed' }],
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
    const issues = createGithubRenewalIssues((args) => {
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
      run: 'node scripts/security-txt-renewal.ts',
      env: {
        GH_TOKEN: `${'$'}{{ github.token }}`,
        GH_REPO: `${'$'}{{ github.repository }}`,
      },
    });
  });
});
