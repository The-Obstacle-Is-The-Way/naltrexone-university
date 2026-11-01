import { describe, expect, it } from 'vitest';
import { ghRunnerFailure } from '../lib/github-cli-test-helpers';
import {
  raiseUpstreamAdvisories,
  runUpstreamAdvisoryWatch,
  watchUpstreamAdvisories,
} from './upstream-advisory-watch.mjs';
import {
  advisory,
  MemoryIssues,
  manifest,
  unreviewed,
} from './upstream-advisory-watch-test-helpers';

// BUG-370: each failed item and the run's own failure line name gh's reason.
describe('the reasons a run reports', () => {
  it('names gh’s reason beside an issue it could not open and a review it could not read', async () => {
    const refused = await ghRunnerFailure(
      'GraphQL: Resource not accessible by integration (createIssue)\n',
    );
    const unread = await ghRunnerFailure(
      'gh: Resource not accessible by integration (HTTP 403)\n',
    );
    const issues = new MemoryIssues();
    issues.create = async () => {
      throw refused;
    };
    expect(
      await raiseUpstreamAdvisories([advisory()], manifest, issues, {
        find: async () => {
          throw unread;
        },
      }),
    ).toEqual({
      raised: [],
      failed: [
        'GHSA-aaaa-bbbb-cccc (GraphQL: Resource not accessible by integration (createIssue))',
      ],
      ruledOut: [],
      unreviewed: [
        'GHSA-aaaa-bbbb-cccc (gh: Resource not accessible by integration (HTTP 403))',
      ],
    });
  });

  it('names an advisory once when both of its review lookups fail', async () => {
    const reasons = [
      await ghRunnerFailure('gh: Server Error (HTTP 502)\n'),
      await ghRunnerFailure('gh: Bad Gateway (HTTP 504)\n'),
    ];
    const issues = new MemoryIssues();
    const outcome = await watchUpstreamAdvisories(
      { direct: ['vercel/next.js'], indirect: [] },
      manifest,
      issues,
      async () => [advisory()],
      {
        find: async () => {
          throw reasons.shift();
        },
      },
    );
    expect(outcome.unreviewed).toEqual([
      'GHSA-aaaa-bbbb-cccc (gh: Server Error (HTTP 502))',
    ]);
  });

  it('names gh’s reason beside a repository it could not read', async () => {
    const failure = await ghRunnerFailure('gh: Server Error (HTTP 502)\n');
    const outcome = await watchUpstreamAdvisories(
      { direct: ['broken/repo'], indirect: [] },
      manifest,
      new MemoryIssues(),
      async () => {
        throw failure;
      },
      unreviewed,
    );
    expect(outcome).toMatchObject({
      read: 0,
      unreadable: ['broken/repo (gh: Server Error (HTTP 502))'],
    });
  });

  it('adds gh’s own line when a gh call fails', async () => {
    const failure = await ghRunnerFailure('gh: Bad credentials (HTTP 401)\n');
    const errors: string[] = [];
    const sink = {
      log: () => {},
      error: (message: string) => errors.push(message),
    };
    expect(
      await runUpstreamAdvisoryWatch(async () => {
        throw failure;
      }, sink),
    ).toBe(1);
    expect(errors).toEqual([
      'Upstream advisory watch failed; inspect the advisory source and GitHub issue access. Cause: gh: Bad credentials (HTTP 401)',
    ]);
  });
});
