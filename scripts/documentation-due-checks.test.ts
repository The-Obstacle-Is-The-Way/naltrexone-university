import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  type AlertIssue,
  type AlertIssues,
  createGithubAlertIssues,
  DUE_CHECKS_ISSUE_TITLE,
  type DueChecksReport,
  reportDueChecks,
  repositoryDueChecks,
  runDocumentationDueChecks,
} from './documentation-due-checks';

class MemoryIssues implements AlertIssues {
  issues: AlertIssue[] = [];
  comments: string[] = [];
  writes = 0;
  async find(title: string) {
    return this.issues.filter((issue) => issue.title.includes(title));
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
    const issue = this.issue(number);
    issue.body = body;
    issue.state = 'OPEN';
    this.writes++;
  }
  async comment(number: number, body: string) {
    this.issue(number);
    this.comments.push(body);
    this.writes++;
  }
  async close(number: number, comment: string) {
    this.issue(number).state = 'CLOSED';
    this.comments.push(comment);
    this.writes++;
  }
  private issue(number: number): AlertIssue {
    const issue = this.issues.find((entry) => entry.number === number);
    if (!issue) throw new Error('Missing fixture issue');
    return issue;
  }
}

const overdue: DueChecksReport = {
  overdue: [
    {
      file: 'docs/bugs/bug-319-subscribe-actions-break-after-a-deploy.md',
      due: '2026-10-19',
    },
  ],
  farFuture: [],
};
const none: DueChecksReport = { overdue: [], farFuture: [] };

describe('overdue production checks alert', () => {
  it('does nothing when no check is overdue and no alert is open', async () => {
    const issues = new MemoryIssues();

    expect(await reportDueChecks(none, issues)).toBe('none');
    expect(issues.writes).toBe(0);
  });

  it('opens one issue naming each overdue record and its due date', async () => {
    const issues = new MemoryIssues();

    expect(await reportDueChecks(overdue, issues)).toBe('created');
    expect(issues.issues).toHaveLength(1);
    expect(issues.issues[0]?.title).toBe(DUE_CHECKS_ISSUE_TITLE);
    expect(issues.issues[0]?.body).toContain(
      '`docs/bugs/bug-319-subscribe-actions-break-after-a-deploy.md` (due 2026-10-19)',
    );
  });

  it('lists far-off due dates too, since a check is meant to happen soon', async () => {
    const issues = new MemoryIssues();
    await reportDueChecks(
      {
        overdue: [],
        farFuture: [{ file: 'docs/debt/debt-001-x.md', due: '2027-06-01' }],
      },
      issues,
    );

    expect(issues.issues[0]?.body).toContain(
      '`docs/debt/debt-001-x.md` (due 2027-06-01)',
    );
  });

  it('leaves an open issue with the same list unchanged', async () => {
    const issues = new MemoryIssues();
    await reportDueChecks(overdue, issues);

    expect(await reportDueChecks(overdue, issues)).toBe('unchanged');
    expect(issues.writes).toBe(1);
  });

  // An edited description notifies nobody; a comment does.
  it('comments when the overdue list changes', async () => {
    const issues = new MemoryIssues();
    await reportDueChecks(overdue, issues);
    const longer: DueChecksReport = {
      overdue: [
        ...overdue.overdue,
        { file: 'docs/debt/debt-001-x.md', due: '2026-10-20' },
      ],
      farFuture: [],
    };

    expect(await reportDueChecks(longer, issues)).toBe('updated');
    expect(issues.issues[0]?.body).toContain('docs/debt/debt-001-x.md');
    expect(issues.comments).toHaveLength(1);
  });

  it('reopens a closed issue when checks are overdue again', async () => {
    const issues = new MemoryIssues();
    await reportDueChecks(overdue, issues);
    await reportDueChecks(none, issues);

    expect(await reportDueChecks(overdue, issues)).toBe('updated');
    expect(issues.issues[0]?.state).toBe('OPEN');
  });

  it('closes the open issue, with a comment, once nothing is overdue', async () => {
    const issues = new MemoryIssues();
    await reportDueChecks(overdue, issues);

    expect(await reportDueChecks(none, issues)).toBe('closed');
    expect(issues.issues[0]?.state).toBe('CLOSED');
    expect(issues.comments).toHaveLength(1);
  });

  it('refuses to guess between two issues with the alert title', async () => {
    const issues = new MemoryIssues();
    await issues.create(DUE_CHECKS_ISSUE_TITLE, 'a');
    await issues.create(DUE_CHECKS_ISSUE_TITLE, 'b');

    await expect(reportDueChecks(overdue, issues)).rejects.toThrow(
      'Multiple overdue-check issues',
    );
  });

  it('reports a failure without leaking details, and exits nonzero', async () => {
    const lines: string[] = [];
    const output = {
      log: (line: string) => lines.push(line),
      error: (line: string) => lines.push(line),
    };

    expect(
      await runDocumentationDueChecks(async () => {
        throw new Error('token rejected');
      }, output),
    ).toBe(1);
    expect(lines.join('\n')).not.toContain('token rejected');
  });
});

describe('GitHub alert issues', () => {
  it('searches for the alert by title on the server, not by listing every issue', async () => {
    const calls: string[][] = [];
    const issues = createGithubAlertIssues((args) => {
      calls.push(args);
      return JSON.stringify([
        { number: 7, title: DUE_CHECKS_ISSUE_TITLE, body: 'b', state: 'OPEN' },
        { number: 8, title: 'Unrelated', body: null, state: 'CLOSED' },
      ]);
    });

    expect(await issues.find(DUE_CHECKS_ISSUE_TITLE)).toEqual([
      { number: 7, title: DUE_CHECKS_ISSUE_TITLE, body: 'b', state: 'OPEN' },
      { number: 8, title: 'Unrelated', body: '', state: 'CLOSED' },
    ]);
    expect(calls[0]).toEqual([
      'issue',
      'list',
      '--state',
      'all',
      '--search',
      `in:title "${DUE_CHECKS_ISSUE_TITLE}"`,
      '--json',
      'number,title,body,state',
      '--limit',
      '20',
    ]);
  });

  it('rejects a malformed search response', async () => {
    const issues = createGithubAlertIssues(() => '[{"number":"7"}]');

    await expect(issues.find(DUE_CHECKS_ISSUE_TITLE)).rejects.toThrow(
      'Invalid GitHub issue response',
    );
  });

  it('creates, updates, comments on and closes issues through gh', async () => {
    const calls: string[][] = [];
    const issues = createGithubAlertIssues((args) => {
      calls.push(args);
      return '';
    });

    await issues.create('T', 'B');
    await issues.update(7, 'B2');
    await issues.comment(7, 'C');
    await issues.close(7, 'D');

    expect(calls).toEqual([
      ['issue', 'create', '--title', 'T', '--body', 'B'],
      [
        'api',
        '--method',
        'PATCH',
        'repos/{owner}/{repo}/issues/7',
        '-f',
        'state=open',
        '-f',
        'body=B2',
      ],
      ['issue', 'comment', '7', '--body', 'C'],
      ['issue', 'close', '7', '--comment', 'D'],
    ]);
  });
});

describe('due checks in a repository', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true });
  });

  function repository(status: string): string {
    const root = mkdtempSync(path.join(os.tmpdir(), 'due-checks-'));
    roots.push(root);
    const write = (file: string, contents: string) => {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), contents);
    };
    for (const register of ['specs', 'brainstorming', 'audits', 'qa'])
      write(`docs/${register}/index.md`, '# Register');
    write('docs/debt/index.md', '**Now** — current');
    write(
      'docs/bugs/index.md',
      '**Now** — BUG-001\n\n| ID | Title |\n| --- | --- |\n| [BUG-001](./bug-001-x.md) | X |',
    );
    write('docs/bugs/bug-001-x.md', `**Status:** ${status}`);
    return root;
  }

  it('finds overdue and far-off Verifying records', () => {
    const root = repository('Verifying — check; due 2026-10-19');

    expect(repositoryDueChecks(root, '2026-10-20')).toEqual({
      overdue: [{ file: 'docs/bugs/bug-001-x.md', due: '2026-10-19' }],
      farFuture: [],
    });
    expect(repositoryDueChecks(root, '2026-07-01')).toEqual({
      overdue: [],
      farFuture: [{ file: 'docs/bugs/bug-001-x.md', due: '2026-10-19' }],
    });
  });

  // The weekly job runs this exact command; it must start under tsx.
  it('starts as the workflow runs it, and a dry run touches no issue', () => {
    const root = repository('Open — nothing to verify');
    const result = spawnSync(
      path.resolve('node_modules/.bin/tsx'),
      [path.resolve('scripts/documentation-due-checks.ts'), '--dry-run'],
      { cwd: root, encoding: 'utf8', timeout: 30_000 },
    );

    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Overdue production checks: 0');
    expect(result.status).toBe(0);
  });

  it('runs weekly with issue access only for its own job', () => {
    const workflow = parse(
      readFileSync('.github/workflows/documentation-due-checks.yml', 'utf8'),
    );

    expect(workflow.on.schedule).toHaveLength(1);
    expect(workflow.permissions).toEqual({ contents: 'read' });
    const job = workflow.jobs['due-checks'];
    expect(job.permissions).toEqual({ contents: 'read', issues: 'write' });
    expect(job.steps.at(-1).run).toBe(
      'pnpm exec tsx scripts/documentation-due-checks.ts',
    );
  });
});
