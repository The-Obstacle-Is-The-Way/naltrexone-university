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
import { withRecordedCli } from '../../tests/shared/recorded-cli';
import { ghRunnerFailure } from '../lib/github-cli-test-helpers';
import { MemoryIssues } from '../watchers/github-alert-issues-test-helpers';
import {
  DUE_CHECKS_ISSUE_TITLE,
  type DueChecksReport,
  reportDueChecks,
  repositoryDueChecks,
  runDocumentationDueChecks,
  runFromCommandLine,
} from './documentation-due-checks';

const overdue: DueChecksReport = {
  overdue: [
    {
      file: 'docs/records/bug-319-subscribe-actions-break-after-a-deploy.md',
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
      '`docs/records/bug-319-subscribe-actions-break-after-a-deploy.md` (due 2026-10-19)',
    );
  });

  // The queue review is raised on its due day, so the heading cannot say
  // "past" its due date.
  it('lists the scheduled checks under a heading that fits one due today', async () => {
    const issues = new MemoryIssues();
    await reportDueChecks(
      {
        overdue: [{ file: 'docs/records/README.md', due: '2026-10-19' }],
        farFuture: [],
      },
      issues,
    );
    expect(issues.issues[0]?.body).toContain('**Due or overdue:**');
    expect(issues.issues[0]?.body).not.toContain('Past their due date');
  });

  it('lists far-off due dates too, since a check is meant to happen soon', async () => {
    const issues = new MemoryIssues();
    await reportDueChecks(
      {
        overdue: [],
        farFuture: [{ file: 'docs/records/debt-001-x.md', due: '2027-06-01' }],
      },
      issues,
    );

    expect(issues.issues[0]?.body).toContain(
      '`docs/records/debt-001-x.md` (due 2027-06-01)',
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
        { file: 'docs/records/debt-001-x.md', due: '2026-10-20' },
      ],
      farFuture: [],
    };

    expect(await reportDueChecks(longer, issues)).toBe('updated');
    expect(issues.issues[0]?.body).toContain('docs/records/debt-001-x.md');
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
      `Multiple "${DUE_CHECKS_ISSUE_TITLE}" issues`,
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

  it('adds gh’s own line when a gh call fails', async () => {
    const lines: string[] = [];
    const output = {
      log: (line: string) => lines.push(line),
      error: (line: string) => lines.push(line),
    };
    const failure = await ghRunnerFailure(
      'GraphQL: Resource not accessible by integration (createIssue)\n',
    );
    expect(
      await runDocumentationDueChecks(async () => {
        throw failure;
      }, output),
    ).toBe(1);
    expect(lines).toEqual([
      'Overdue production check failed; inspect the records and GitHub issue access. Cause: GraphQL: Resource not accessible by integration (createIssue)',
    ]);
  });

  // A broken queue-review line is the repository's own text, safe to print,
  // and the one failure a reader can fix from the message alone.
  it('names a broken queue-review line, which carries no credential', async () => {
    const lines: string[] = [];
    const output = {
      log: (line: string) => lines.push(line),
      error: (line: string) => lines.push(line),
    };
    const root = mkdtempSync(path.join(os.tmpdir(), 'due-checks-'));
    mkdirSync(path.join(root, 'docs/records'), { recursive: true });
    writeFileSync(path.join(root, 'docs/records/README.md'), '**Now** — none');
    writeFileSync(
      path.join(root, 'docs/records/closed.md'),
      '# Closed Records',
    );
    expect(
      await runDocumentationDueChecks(async () => {
        repositoryDueChecks(root);
        return 'unreachable';
      }, output),
    ).toBe(1);
    rmSync(root, { recursive: true });
    expect(lines.join('\n')).toContain('Queue review due');
  });
});

describe('due checks in a repository', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true });
  });

  function repository(status: string, queueDue?: string): string {
    const root = mkdtempSync(path.join(os.tmpdir(), 'due-checks-'));
    roots.push(root);
    const write = (file: string, contents: string) => {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), contents);
    };
    write(
      'docs/records/README.md',
      `**Queue review due:** ${queueDue ?? new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)}\n\n**Now** — BUG-001\n\n| ID | Title |\n| --- | --- |\n| [BUG-001](./bug-001-x.md) | X |`,
    );
    write('docs/records/closed.md', '# Closed Records');
    write('docs/records/bug-001-x.md', `**Status:** ${status}`);
    return root;
  }

  it('finds overdue and far-off Verifying records', () => {
    const root = repository('Verifying — check; due 2026-10-19', '2026-10-21');

    expect(repositoryDueChecks(root, '2026-10-20')).toEqual({
      overdue: [{ file: 'docs/records/bug-001-x.md', due: '2026-10-19' }],
      farFuture: [],
    });
    expect(repositoryDueChecks(root, '2026-07-01')).toEqual({
      overdue: [],
      farFuture: [
        { file: 'docs/records/bug-001-x.md', due: '2026-10-19' },
        { file: 'docs/records/README.md', due: '2026-10-21' },
      ],
    });
  });

  it.each(['Open', 'In Progress', 'Blocked'])(
    'reports a scheduled action while its record is %s',
    (status) => {
      const root = repository(
        `${status} — owner decision; due 2026-10-19`,
        '2026-10-21',
      );
      expect(repositoryDueChecks(root, '2026-10-20').overdue).toEqual([
        { file: 'docs/records/bug-001-x.md', due: '2026-10-19' },
      ]);
    },
  );

  // The weekly job runs on Mondays, so a record due that day is raised then,
  // not a week later.
  it('raises a record on its due day', () => {
    const root = repository('Verifying — check; due 2026-10-19', '2026-10-24');
    expect(repositoryDueChecks(root, '2026-10-19').overdue).toEqual([
      { file: 'docs/records/bug-001-x.md', due: '2026-10-19' },
    ]);
  });

  // The queue review moves at most seven days at a time.
  it('reports a queue review set more than seven days ahead', () => {
    const root = repository('Open', '2026-10-28');
    expect(repositoryDueChecks(root, '2026-10-19').farFuture).toEqual([
      { file: 'docs/records/README.md', due: '2026-10-28' },
    ]);
    expect(repositoryDueChecks(root, '2026-10-21').farFuture).toEqual([]);
  });

  it('raises the queue review on its due day even without overdue Verifying records', () => {
    const root = repository('Open — no dated action', '2026-10-19');
    expect(repositoryDueChecks(root, '2026-10-19').overdue).toEqual([
      { file: 'docs/records/README.md', due: '2026-10-19' },
    ]);
  });

  it('refuses a missing or invalid queue review date instead of silently skipping Waiting', () => {
    const root = repository('Open', '2026-02-30');
    expect(() => repositoryDueChecks(root)).toThrow('Queue review due');
    writeFileSync(path.join(root, 'docs/records/README.md'), '**Now** — none');
    expect(() => repositoryDueChecks(root)).toThrow('Queue review due');
  });

  it('refuses a second queue review line, even one whose date cannot be read', () => {
    const root = repository('Open', '2026-10-19');
    const readme = path.join(root, 'docs/records/README.md');
    writeFileSync(
      readme,
      `**Queue review due:** 2026-1-5\n\n${readFileSync(readme, 'utf8')}`,
    );
    expect(() => repositoryDueChecks(root, '2026-10-12')).toThrow(
      'Queue review due',
    );
  });

  it('reports in a dry run without touching any issue', async () => {
    const root = repository('Verifying — check; due 2000-01-03');
    const lines: string[] = [];
    await withRecordedCli('gh', '[]', async (calls) => {
      expect(
        await runFromCommandLine(['node', 'script', '--dry-run'], root, {
          log: (line) => lines.push(line),
          error: (line) => lines.push(line),
        }),
      ).toBe(0);
      expect(lines).toEqual([
        'Overdue production checks: 1 overdue, 0 far off (dry run; no issue touched)',
      ]);
      expect(calls()).toEqual([]);
    });
  });

  it('raises the overdue checks through the default GitHub transport', async () => {
    const root = repository('Verifying — check; due 2000-01-03');
    await withRecordedCli('gh', '[]', async (calls) => {
      expect(
        await runFromCommandLine(['node', 'script'], root, {
          log: () => {},
          error: () => {},
        }),
      ).toBe(0);
      expect(calls().map((args) => args.slice(0, 2))).toEqual([
        ['issue', 'list'],
        ['issue', 'create'],
      ]);
    });
  });

  // The weekly job runs this exact command; it must start under tsx.
  it('starts as the workflow runs it, and a dry run touches no issue', () => {
    const root = repository('Open — nothing to verify');
    const result = spawnSync(
      path.resolve('node_modules/.bin/tsx'),
      [
        path.resolve('scripts/records/documentation-due-checks.ts'),
        '--dry-run',
      ],
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
      'pnpm exec tsx scripts/records/documentation-due-checks.ts',
    );
  });
});
