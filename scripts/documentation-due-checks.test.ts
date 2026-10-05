import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  DUE_CHECKS_ISSUE_TITLE,
  reportOverdueChecks,
  repositoryOverdueChecks,
  runDocumentationDueChecks,
} from './documentation-due-checks';
import type { RenewalIssue, RenewalIssues } from './security-txt-renewal';

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

const overdue = [
  {
    file: 'docs/bugs/bug-319-subscribe-actions-break-after-a-deploy.md',
    due: '2026-10-19',
  },
];

describe('overdue production checks alert', () => {
  it('does nothing when no Verifying record is past due', async () => {
    const issues = new MemoryIssues();

    expect(await reportOverdueChecks([], issues)).toBe('none');
    expect(issues.writes).toBe(0);
  });

  it('opens one issue naming each overdue record and its due date', async () => {
    const issues = new MemoryIssues();

    expect(await reportOverdueChecks(overdue, issues)).toBe('created');
    expect(issues.issues).toHaveLength(1);
    expect(issues.issues[0]?.title).toBe(DUE_CHECKS_ISSUE_TITLE);
    expect(issues.issues[0]?.body).toContain(
      'docs/bugs/bug-319-subscribe-actions-break-after-a-deploy.md',
    );
    expect(issues.issues[0]?.body).toContain('due 2026-10-19');
  });

  it('leaves an open issue with the same list unchanged', async () => {
    const issues = new MemoryIssues();
    await reportOverdueChecks(overdue, issues);

    expect(await reportOverdueChecks(overdue, issues)).toBe('unchanged');
    expect(issues.writes).toBe(1);
  });

  it('reopens a closed issue when checks are overdue again', async () => {
    const issues = new MemoryIssues();
    await reportOverdueChecks(overdue, issues);
    const [issue] = issues.issues;
    if (issue) issue.state = 'CLOSED';

    expect(await reportOverdueChecks(overdue, issues)).toBe('updated');
    expect(issues.issues[0]?.state).toBe('OPEN');
  });

  it('refuses to guess between two issues with the alert title', async () => {
    const issues = new MemoryIssues();
    await issues.create(DUE_CHECKS_ISSUE_TITLE, 'a');
    await issues.create(DUE_CHECKS_ISSUE_TITLE, 'b');

    await expect(reportOverdueChecks(overdue, issues)).rejects.toThrow(
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

  it('finds a Verifying record past its due date in a repository', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'due-checks-'));
    try {
      const write = (file: string, contents: string) => {
        mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        writeFileSync(path.join(root, file), contents);
      };
      for (const register of ['specs', 'brainstorming', 'audits', 'qa'])
        write(`docs/${register}/index.md`, '# Register');
      write('docs/debt/index.md', '**Now** — current');
      write(
        'docs/bugs/index.md',
        '**Now** — current\n\n| ID | Title |\n| --- | --- |\n| [BUG-001](./bug-001-x.md) | X |',
      );
      write(
        'docs/bugs/bug-001-x.md',
        '**Status:** Verifying — check; due 2026-10-19',
      );

      expect(repositoryOverdueChecks(root, '2026-10-20')).toEqual([
        { file: 'docs/bugs/bug-001-x.md', due: '2026-10-19' },
      ]);
      expect(repositoryOverdueChecks(root, '2026-10-19')).toEqual([]);
    } finally {
      rmSync(root, { recursive: true });
    }
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
