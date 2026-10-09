import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import {
  DUE_CHECKS_ISSUE_TITLE,
  type DueChecksReport,
  reportDueChecks,
  repositoryDueChecks,
  runDocumentationDueChecks,
  runFromCommandLine,
} from './documentation-due-checks';
import { MemoryIssues } from './github-alert-issues-test-helpers';

// Only execFileSync, which runs gh, is replaced; spawnSync stays real.
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFileSync: vi.fn(),
}));
const gh = vi.mocked(execFileSync);

afterEach(() => {
  gh.mockReset();
});

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

  it('reports in a dry run without touching any issue', async () => {
    const root = repository('Verifying — check; due 2000-01-03');
    const lines: string[] = [];

    expect(
      await runFromCommandLine(['node', 'script', '--dry-run'], root, {
        log: (line) => lines.push(line),
        error: (line) => lines.push(line),
      }),
    ).toBe(0);
    expect(lines).toEqual([
      'Overdue production checks: 1 overdue, 0 far off (dry run; no issue touched)',
    ]);
    expect(gh).not.toHaveBeenCalled();
  });

  it('raises the overdue checks as an issue through gh', async () => {
    const root = repository('Verifying — check; due 2000-01-03');
    gh.mockImplementation((_command, args) =>
      Array.isArray(args) && args[1] === 'list' ? '[]' : '',
    );

    expect(
      await runFromCommandLine(['node', 'script'], root, {
        log: () => {},
        error: () => {},
      }),
    ).toBe(0);
    expect(
      gh.mock.calls.map(([, args]) => (args as string[]).slice(0, 2)),
    ).toEqual([
      ['issue', 'list'],
      ['issue', 'create'],
    ]);
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
