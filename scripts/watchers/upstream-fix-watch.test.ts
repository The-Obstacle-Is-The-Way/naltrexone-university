import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { MemoryIssues } from './github-alert-issues-test-helpers';
import {
  alertTitle,
  createUpstreamReads,
  type Landing,
  type Release,
  runUpstreamFixWatch,
  UPSTREAM_FIX_WATCHES,
  type UpstreamFixWatch,
  type UpstreamReads,
  watchUpstreamFixes,
} from './upstream-fix-watch';

const watch: UpstreamFixWatch = {
  record: 'DEBT-500',
  trackingIssue: 1500,
  repository: 'stryker-mutator/stryker-js',
  issue: 6210,
  fixPullRequests: [6214, 6220],
  npmPackage: '@stryker-mutator/vitest-runner',
};

class MemoryReads implements UpstreamReads {
  constructor(
    private readonly landed: Landing[],
    private readonly published: Release[],
  ) {}
  async landings() {
    return this.landed;
  }
  async releases() {
    return this.published;
  }
}

const merged: Landing = {
  what: 'stryker-mutator/stryker-js#6214 merged',
  at: '2026-11-02T10:00:00Z',
};
const before: Release = { version: '10.0.0', at: '2026-08-14T16:50:27Z' };
const after: Release = { version: '10.1.0', at: '2026-11-09T12:00:00Z' };

describe('watchUpstreamFixes', () => {
  it('raises nothing while the fix has not landed upstream', async () => {
    const issues = new MemoryIssues();

    await watchUpstreamFixes([watch], new MemoryReads([], [before]), issues);

    expect(issues.issues).toEqual([]);
  });

  it('raises nothing while no release has followed the fix', async () => {
    const issues = new MemoryIssues();

    await watchUpstreamFixes(
      [watch],
      new MemoryReads([merged], [before]),
      issues,
    );

    expect(issues.issues).toEqual([]);
  });

  it('raises one issue once a release follows the fix, saying what landed and what to do', async () => {
    const issues = new MemoryIssues();
    const preRelease: Release = {
      version: '10.1.0-beta.0',
      at: '2026-11-05T12:00:00Z',
    };

    await watchUpstreamFixes(
      [watch],
      new MemoryReads([merged], [before, preRelease, after]),
      issues,
    );

    expect(issues.issues.map(({ title }) => title)).toEqual([
      'Upstream fix released: stryker-mutator/stryker-js#6210 (DEBT-500)',
    ]);
    const body = issues.issues[0]?.body ?? '';
    expect(body).toContain('stryker-mutator/stryker-js#6214 merged');
    expect(body).toContain('10.1.0 (2026-11-09T12:00:00Z)');
    expect(body).not.toContain('10.1.0-beta.0');
    expect(body).toContain('#1500');
  });

  it('compares times as instants, so a release in the landing’s second still follows it', async () => {
    const issues = new MemoryIssues();
    // GitHub gives whole seconds; npm gives milliseconds.
    const landing: Landing = { ...merged, at: '2026-11-02T10:00:00Z' };
    const sameSecond: Release = {
      version: '10.1.0',
      at: '2026-11-02T10:00:00.500Z',
    };

    await watchUpstreamFixes(
      [watch],
      new MemoryReads([landing], [sameSecond]),
      issues,
    );

    expect(issues.issues).toHaveLength(1);
  });

  it('dates the fix from its earliest landing', async () => {
    const issues = new MemoryIssues();
    const closed: Landing = {
      what: 'stryker-mutator/stryker-js#6210 closed (completed)',
      at: '2026-11-10T09:00:00Z',
    };

    await watchUpstreamFixes(
      [watch],
      new MemoryReads([closed, merged], [before, after]),
      issues,
    );

    expect(issues.issues).toHaveLength(1);
  });

  it('leaves an unchanged alert alone on the next run', async () => {
    const issues = new MemoryIssues();
    const reads = new MemoryReads([merged], [after]);
    await watchUpstreamFixes([watch], reads, issues);
    const writes = issues.writes;

    const synced = await watchUpstreamFixes([watch], reads, issues);

    expect(synced).toEqual([{ title: alertTitle(watch), sync: 'unchanged' }]);
    expect(issues.writes).toBe(writes);
  });
});

describe('createUpstreamReads', () => {
  it('reads the upstream issue’s closing and each fix pull request’s merge', async () => {
    const responses: Record<string, unknown> = {
      'repos/stryker-mutator/stryker-js/issues/6210': {
        state: 'closed',
        state_reason: 'completed',
        closed_at: '2026-11-10T09:00:00Z',
      },
      'repos/stryker-mutator/stryker-js/pulls/6214': {
        merged_at: '2026-11-02T10:00:00Z',
      },
      'repos/stryker-mutator/stryker-js/pulls/6220': { merged_at: null },
    };
    const reads = createUpstreamReads((args) =>
      JSON.stringify(responses[args[1] ?? '']),
    );

    expect(await reads.landings(watch)).toEqual([
      {
        what: 'stryker-mutator/stryker-js#6210 closed (completed)',
        at: '2026-11-10T09:00:00Z',
      },
      merged,
    ]);
  });

  it('reads each published version’s release time from the npm registry', async () => {
    const reads = createUpstreamReads(
      () => '',
      async () =>
        Response.json({
          // A manifest without a publish time cannot be dated, so it is skipped.
          versions: { '10.0.0': {}, '10.0.2': {}, '10.1.0': {} },
          time: {
            created: '2020-01-01T00:00:00Z',
            modified: '2026-11-09T12:00:01Z',
            '10.0.0': before.at,
            // An unpublished version keeps its time but loses its manifest.
            '10.0.1': '2026-10-01T00:00:00Z',
            '10.1.0': after.at,
          },
        }),
    );

    expect(await reads.releases(watch.npmPackage)).toEqual([before, after]);
  });

  it('rejects a GitHub response that is not an object', async () => {
    const reads = createUpstreamReads(() => '[]');

    await expect(reads.landings(watch)).rejects.toThrow(
      'Invalid GitHub response: repos/stryker-mutator/stryker-js/issues/6210',
    );
  });

  it('fails when the npm registry does not answer', async () => {
    const reads = createUpstreamReads(
      () => '',
      async () => new Response(null, { status: 503 }),
    );

    await expect(reads.releases(watch.npmPackage)).rejects.toThrow(
      'npm registry request failed',
    );
  });

  it('rejects an npm registry document without versions and times', async () => {
    const reads = createUpstreamReads(
      () => '',
      async () => Response.json({ name: watch.npmPackage }),
    );

    await expect(reads.releases(watch.npmPackage)).rejects.toThrow(
      'Invalid npm registry response',
    );
  });
});

describe('runUpstreamFixWatch', () => {
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

  it('logs what it did with each watch’s alert', async () => {
    const { lines, output } = capture();

    const code = await runUpstreamFixWatch(
      new MemoryReads([merged], [after]),
      new MemoryIssues(),
      output,
    );

    expect(code).toBe(0);
    expect(lines).toEqual([
      'Upstream fix released: stryker-mutator/stryker-js#6210 (DEBT-500): created',
    ]);
  });

  it('fails the run, saying so, when an upstream read fails', async () => {
    const { lines, output } = capture();
    const failing: UpstreamReads = {
      landings: async () => {
        throw new Error('HTTP 404');
      },
      releases: async () => [],
    };

    const code = await runUpstreamFixWatch(failing, new MemoryIssues(), output);

    expect(code).toBe(1);
    expect(lines).toEqual(['Upstream fix watch failed: HTTP 404']);
  });

  it('watches the Stryker runner fix that DEBT-500’s patch waits for', () => {
    expect(UPSTREAM_FIX_WATCHES).toContainEqual(
      expect.objectContaining({
        record: 'DEBT-500',
        trackingIssue: 1500,
        repository: 'stryker-mutator/stryker-js',
        issue: 6210,
        npmPackage: '@stryker-mutator/vitest-runner',
      }),
    );
  });

  it('runs weekly with issue access only for its own job', () => {
    const workflow = parse(
      readFileSync('.github/workflows/upstream-fix-watch.yml', 'utf8'),
    );

    expect(workflow.on.schedule).toHaveLength(1);
    expect(workflow.permissions).toEqual({ contents: 'read' });
    const job = workflow.jobs.watch;
    expect(job.permissions).toEqual({ contents: 'read', issues: 'write' });
    expect(job.steps.at(-1).run).toBe(
      'pnpm exec tsx scripts/watchers/upstream-fix-watch.ts',
    );
  });
});
