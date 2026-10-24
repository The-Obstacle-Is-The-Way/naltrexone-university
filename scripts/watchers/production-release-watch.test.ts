import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { MemoryIssues } from './github-alert-issues-test-helpers';
import {
  type CiRun,
  createReleaseReads,
  type MainHead,
  RELEASE_GRACE_MS,
  RELEASE_ISSUE_TITLE,
  type ReleaseReads,
  runProductionReleaseWatch,
  watchProductionRelease,
} from './production-release-watch';

const SHA = '2f1278a1b4a0a9e3f6d1c5e8b7a6d5c4b3a2f1e0';
const MERGED_AT = new Date('2026-10-15T15:44:17Z');
const LATE = new Date(MERGED_AT.getTime() + RELEASE_GRACE_MS + 1);
const EARLY = new Date(MERGED_AT.getTime() + RELEASE_GRACE_MS - 1);

class MemoryReads implements ReleaseReads {
  constructor(
    private readonly runs: CiRun[],
    private readonly deploymentStates: string[],
    private readonly head: MainHead = { sha: SHA, committedAt: MERGED_AT },
  ) {}
  async mainHead() {
    return this.head;
  }
  async mainCiRuns(sha: string) {
    return sha === this.head.sha ? this.runs : [];
  }
  async productionDeploymentStates(sha: string) {
    return sha === this.head.sha ? this.deploymentStates : [];
  }
}

const passed: CiRun = { status: 'completed', conclusion: 'success' };
const failed: CiRun = { status: 'completed', conclusion: 'failure' };
const cancelled: CiRun = { status: 'completed', conclusion: 'cancelled' };
const running: CiRun = { status: 'in_progress', conclusion: null };

async function watch(
  reads: ReleaseReads,
  now: Date,
  issues = new MemoryIssues(),
) {
  const result = await watchProductionRelease({ reads, issues, now });
  return { result, issues };
}

describe('watchProductionRelease', () => {
  it('raises nothing once main’s head has a passing CI run and a production deployment', async () => {
    const { result, issues } = await watch(
      new MemoryReads([passed], ['success']),
      LATE,
    );

    expect(result).toBe('none');
    expect(issues.writes).toBe(0);
  });

  it('waits out the grace period before judging a new head', async () => {
    const { result, issues } = await watch(new MemoryReads([], []), EARLY);

    expect(result).toBe('undecided');
    expect(issues.writes).toBe(0);
  });

  it('raises a dropped push: no CI run for main’s head', async () => {
    const { result, issues } = await watch(new MemoryReads([], []), LATE);

    expect(result).toBe('created');
    expect(issues.issues[0]?.title).toBe(RELEASE_ISSUE_TITLE);
    expect(issues.issues[0]?.body).toContain(
      `CI has not run on \`main\`'s head \`${SHA}\`, merged 2026-10-15T15:44:17.000Z`,
    );
    expect(issues.issues[0]?.body).toContain(
      `gh workflow run ci.yml --ref main -f sha=${SHA}`,
    );
  });

  it('raises a head whose CI did not pass, naming how each run ended', async () => {
    const { issues } = await watch(
      new MemoryReads(
        [failed, cancelled, { status: 'completed', conclusion: null }],
        [],
      ),
      LATE,
    );

    expect(issues.issues[0]?.body).toContain(
      'CI did not pass on it (failure, cancelled, no conclusion), so the Deployment Check holds production',
    );
  });

  it('waits while a CI run is still running', async () => {
    const { result } = await watch(new MemoryReads([running], []), LATE);

    expect(result).toBe('undecided');
  });

  it('counts any passing CI run of the head', async () => {
    const { result } = await watch(
      new MemoryReads([failed, passed], ['success']),
      LATE,
    );

    expect(result).toBe('none');
  });

  it('raises a passing head with no successful production deployment, saying how to record a manual release', async () => {
    const { issues } = await watch(
      new MemoryReads([passed], ['failure']),
      LATE,
    );

    expect(issues.issues[0]?.body).toContain(
      'no successful production deployment',
    );
    expect(issues.issues[0]?.body).toContain(
      "If it was released through the guide's manual route, record the release on GitHub, as the guide's last step says.",
    );
  });

  it('closes the issue once main’s head is released', async () => {
    const issues = new MemoryIssues();
    await watch(new MemoryReads([], []), LATE, issues);

    const { result } = await watch(
      new MemoryReads([passed], ['success']),
      LATE,
      issues,
    );

    expect(result).toBe('closed');
    expect(issues.issues[0]?.state).toBe('CLOSED');
  });

  it('keeps an open alarm while a newer head is still in its grace period', async () => {
    const issues = new MemoryIssues();
    await watch(new MemoryReads([], []), LATE, issues);
    const newer: MainHead = {
      sha: 'a'.repeat(40),
      committedAt: new Date(LATE.getTime() - 1),
    };

    const { result } = await watch(
      new MemoryReads([], [], newer),
      LATE,
      issues,
    );

    expect(result).toBe('undecided');
    expect(issues.issues[0]?.state).toBe('OPEN');
  });
});

function statusesPath(deploymentId: number): string {
  return `repos/{owner}/{repo}/deployments/${deploymentId}/statuses?per_page=100`;
}

describe('createReleaseReads', () => {
  const runsPath = `repos/{owner}/{repo}/actions/workflows/ci.yml/runs?head_sha=${SHA}&per_page=100`;
  const deploymentsPath = `repos/{owner}/{repo}/deployments?sha=${SHA}&environment=Production&per_page=100`;
  const responses: Record<string, unknown> = {
    'repos/{owner}/{repo}/commits?sha=main&per_page=1': [
      { sha: SHA, commit: { committer: { date: '2026-10-15T15:44:17Z' } } },
    ],
    // Lists come as every page, as `gh api --paginate --slurp` returns them.
    [runsPath]: [
      {
        workflow_runs: [
          {
            event: 'push',
            head_branch: 'main',
            status: 'completed',
            conclusion: 'failure',
          },
        ],
      },
      {
        workflow_runs: [
          {
            event: 'workflow_dispatch',
            head_branch: 'main',
            status: 'queued',
            conclusion: null,
          },
          {
            event: 'pull_request',
            head_branch: 'dev',
            status: 'completed',
            conclusion: 'success',
          },
          {
            event: 'workflow_dispatch',
            head_branch: 'feature',
            status: 'completed',
            conclusion: 'success',
          },
        ],
      },
    ],
    [deploymentsPath]: [[{ id: 7 }, { id: 8 }], [{ id: 9 }]],
    // Every page of statuses, oldest first: GitHub does not document the order.
    [statusesPath(7)]: [
      [{ id: 71, state: 'in_progress', created_at: '2026-10-15T15:45:00Z' }],
      [{ id: 72, state: 'success', created_at: '2026-10-15T15:47:00Z' }],
    ],
    [statusesPath(8)]: [[]],
    // Newest first, with two statuses in one second: the later ID is current.
    [statusesPath(9)]: [
      [
        { id: 93, state: 'failure', created_at: '2026-10-15T15:50:00Z' },
        { id: 92, state: 'success', created_at: '2026-10-15T15:50:00Z' },
        { id: 91, state: 'in_progress', created_at: '2026-10-15T15:46:00Z' },
      ],
    ],
  };
  const reads = createReleaseReads((args) =>
    JSON.stringify(responses[args.at(-1) ?? '']),
  );

  it('reads main’s head from the commit list, which carries no file patches', async () => {
    expect(await reads.mainHead()).toEqual({
      sha: SHA,
      committedAt: MERGED_AT,
    });
  });

  it('keeps only main’s push and manual CI runs of a commit, from every page', async () => {
    expect(await reads.mainCiRuns(SHA)).toEqual([
      failed,
      { status: 'queued', conclusion: null },
    ]);
  });

  it('reads each production deployment’s newest status by its time, whatever the order and paging, skipping one with no status', async () => {
    expect(await reads.productionDeploymentStates(SHA)).toEqual([
      'success',
      'failure',
    ]);
  });

  it('asks gh for every page of the run, deployment and status lists', async () => {
    const calls: string[][] = [];
    const recording = createReleaseReads((args) => {
      calls.push(args);
      return JSON.stringify(responses[args.at(-1) ?? '']);
    });

    await recording.mainCiRuns(SHA);
    await recording.productionDeploymentStates(SHA);

    for (const path of [runsPath, deploymentsPath, statusesPath(7)])
      expect(calls).toContainEqual(['api', '--paginate', '--slurp', path]);
  });

  it('rejects a head that is not a full commit SHA', async () => {
    const broken = createReleaseReads(() =>
      JSON.stringify([{ sha: 'main', commit: { committer: { date: 'x' } } }]),
    );

    await expect(broken.mainHead()).rejects.toThrow(
      'Invalid GitHub response: repos/{owner}/{repo}/commits?sha=main&per_page=1',
    );
  });

  it('rejects a commit list that is not a list', async () => {
    const broken = createReleaseReads(() => JSON.stringify({ sha: SHA }));

    await expect(broken.mainHead()).rejects.toThrow('Invalid GitHub response');
  });

  it('rejects a head commit without a committer', async () => {
    const broken = createReleaseReads(() =>
      JSON.stringify([{ sha: SHA, commit: {} }]),
    );

    await expect(broken.mainHead()).rejects.toThrow('Invalid GitHub response');
  });

  it('rejects a run list that is not a list of runs', async () => {
    const broken = createReleaseReads(() => JSON.stringify({ total: 0 }));

    await expect(broken.mainCiRuns(SHA)).rejects.toThrow(
      'Invalid GitHub response',
    );
  });

  it('rejects a run without a status', async () => {
    const broken = createReleaseReads(() =>
      JSON.stringify([
        {
          workflow_runs: [
            { event: 'push', head_branch: 'main', conclusion: 'success' },
          ],
        },
      ]),
    );

    await expect(broken.mainCiRuns(SHA)).rejects.toThrow(
      'Invalid GitHub response',
    );
  });

  it('rejects a deployment list that is not a list', async () => {
    const broken = createReleaseReads(() => JSON.stringify({ id: 7 }));

    await expect(broken.productionDeploymentStates(SHA)).rejects.toThrow(
      'Invalid GitHub response',
    );
  });

  it('rejects a deployment without an id', async () => {
    const broken = createReleaseReads(() => JSON.stringify([[{ sha: SHA }]]));

    await expect(broken.productionDeploymentStates(SHA)).rejects.toThrow(
      'Invalid GitHub response',
    );
  });

  it('rejects a deployment status list that is not a list of pages', async () => {
    const broken = createReleaseReads((args) =>
      JSON.stringify(
        args.at(-1)?.includes('/statuses') ? [{ state: 'x' }] : [[{ id: 7 }]],
      ),
    );

    await expect(broken.productionDeploymentStates(SHA)).rejects.toThrow(
      `Invalid GitHub response: ${statusesPath(7)}`,
    );
  });

  it('rejects a deployment status without an ID', async () => {
    const broken = createReleaseReads((args) =>
      JSON.stringify(
        args.at(-1)?.includes('/statuses')
          ? [[{ state: 'success', created_at: '2026-10-15T15:47:00Z' }]]
          : [[{ id: 7 }]],
      ),
    );

    await expect(broken.productionDeploymentStates(SHA)).rejects.toThrow(
      `Invalid GitHub response: ${statusesPath(7)}`,
    );
  });

  // An unreadable status could be the newest one, so it is not skipped.
  it('rejects a deployment status whose time is not a timestamp string', async () => {
    const broken = createReleaseReads((args) =>
      JSON.stringify(
        args.at(-1)?.includes('/statuses')
          ? [[{ id: 71, state: 'success', created_at: 2026 }]]
          : [[{ id: 7 }]],
      ),
    );

    await expect(broken.productionDeploymentStates(SHA)).rejects.toThrow(
      `Invalid GitHub response: ${statusesPath(7)}`,
    );
  });
});

describe('runProductionReleaseWatch', () => {
  function capture() {
    const lines: string[] = [];
    return {
      lines,
      output: {
        log: (line: string) => lines.push(line),
        error: (line: string) => lines.push(line),
      },
    };
  }

  it('logs what it did with the alert', async () => {
    const { lines, output } = capture();

    const code = await runProductionReleaseWatch(async () => 'created', output);

    expect(code).toBe(0);
    expect(lines).toEqual(['Production release watch: created']);
  });

  it('fails the run, saying so, when a read fails', async () => {
    const { lines, output } = capture();

    const code = await runProductionReleaseWatch(async () => {
      throw new Error('HTTP 502');
    }, output);

    expect(code).toBe(1);
    expect(lines).toEqual(['Production release watch failed: HTTP 502']);
  });

  it('runs hourly with read access to runs and deployments, and issue access only for its own job', () => {
    const workflow = parse(
      readFileSync('.github/workflows/production-release-watch.yml', 'utf8'),
    );

    expect(workflow.on.schedule).toEqual([{ cron: '23 * * * *' }]);
    expect(Object.keys(workflow.on)).toEqual(['schedule', 'workflow_dispatch']);
    expect(workflow.permissions).toEqual({ contents: 'read' });
    const job = workflow.jobs.watch;
    expect(job.permissions).toEqual({
      actions: 'read',
      contents: 'read',
      deployments: 'read',
      issues: 'write',
    });
    expect(job.steps.at(-1).run).toBe(
      'pnpm exec tsx scripts/watchers/production-release-watch.ts',
    );
  });
});
