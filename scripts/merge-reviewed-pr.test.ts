import { execFileSync, spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkFeatureMerge, runMergeReviewedPr } from './merge-reviewed-pr';

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFileSync: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());

const HEAD = 'a'.repeat(40);
const OLD_HEAD = 'b'.repeat(40);
const review = (state = 'APPROVED', commit = HEAD) => ({
  id: 123,
  user: { login: 'coderabbitai[bot]' },
  state,
  commit_id: commit,
  submitted_at: '2026-09-22T03:00:00Z',
});
const pullRequest = () => ({
  number: 987,
  state: 'OPEN',
  isDraft: false,
  baseRefName: 'dev',
  headRefOid: HEAD,
  mergeable: 'MERGEABLE',
  mergeStateStatus: 'CLEAN',
  reviewThreads: {
    nodes: [{ isResolved: true }],
    pageInfo: { hasNextPage: false },
  },
  files: {
    nodes: [{ path: 'src/example.ts' }],
    pageInfo: { hasNextPage: false },
  },
  commits: {
    nodes: [
      {
        commit: {
          oid: HEAD,
          statusCheckRollup: {
            contexts: {
              nodes: [
                {
                  __typename: 'CheckRun',
                  name: 'test',
                  status: 'COMPLETED',
                  conclusion: 'SUCCESS',
                },
                {
                  __typename: 'StatusContext',
                  context: 'CodeRabbit',
                  state: 'SUCCESS',
                },
                {
                  __typename: 'CheckRun',
                  name: 'codecov/patch',
                  status: 'COMPLETED',
                  conclusion: 'SUCCESS',
                },
              ],
              pageInfo: { hasNextPage: false },
            },
          },
        },
      },
    ],
  },
});

describe('feature merge decision', () => {
  it('accepts exact-head approval even when a later comment has no verdict', () => {
    expect(
      checkFeatureMerge(pullRequest(), [[review(), review('COMMENTED')]]),
    ).toMatchObject({
      number: 987,
      head: HEAD,
      approvalId: 123,
      unresolvedThreads: 0,
    });
  });

  it('reads approval from a later API page', () => {
    expect(
      checkFeatureMerge(pullRequest(), [
        [review('APPROVED', OLD_HEAD)],
        [review()],
      ]),
    ).toMatchObject({ head: HEAD });
  });

  it.each([
    ['stale approval', [[review('APPROVED', OLD_HEAD)]]],
    ['comment only', [[review('COMMENTED')]]],
    ['green status without review', [[]]],
    ['another reviewer', [[{ ...review(), user: { login: 'someone-else' } }]]],
    ['later requested changes', [[review(), review('CHANGES_REQUESTED')]]],
    ['dismissed approval', [[review('DISMISSED')]]],
  ])('refuses %s', (_name, pages) => {
    expect(() => checkFeatureMerge(pullRequest(), pages)).toThrow('exact-head');
  });

  it.each([
    ['draft', { isDraft: true }],
    ['closed', { state: 'CLOSED' }],
    ['wrong base', { baseRefName: 'main' }],
    ['outdated branch', { mergeStateStatus: 'BEHIND' }],
    ['conflict', { mergeable: 'CONFLICTING' }],
  ])('refuses a %s PR', (_name, change) => {
    expect(() =>
      checkFeatureMerge({ ...pullRequest(), ...change }, [[review()]]),
    ).toThrow('open, ready, clean PR into dev');
  });

  it('refuses unresolved threads', () => {
    const pr = pullRequest();
    pr.reviewThreads.nodes[0] = { isResolved: false };
    expect(() => checkFeatureMerge(pr, [[review()]])).toThrow('unresolved');
  });

  it('refuses a truncated thread response', () => {
    const pr = pullRequest();
    pr.reviewThreads.pageInfo.hasNextPage = true;
    expect(() => checkFeatureMerge(pr, [[review()]])).toThrow('Incomplete');
  });

  it('refuses a truncated check response', () => {
    const pr = pullRequest();
    const commit = pr.commits.nodes[0]?.commit;
    if (!commit) throw new Error('Missing fixture commit');
    commit.statusCheckRollup.contexts.pageInfo.hasNextPage = true;
    expect(() => checkFeatureMerge(pr, [[review()]])).toThrow('Incomplete');
  });

  it('refuses checks for a different head', () => {
    const pr = pullRequest();
    const commit = pr.commits.nodes[0]?.commit;
    if (!commit) throw new Error('Missing fixture commit');
    commit.oid = OLD_HEAD;
    expect(() => checkFeatureMerge(pr, [[review()]])).toThrow('head');
  });

  it.each(['FAILURE', 'SKIPPED', ''])(
    'refuses test conclusion %j',
    (conclusion) => {
      const pr = pullRequest();
      const check =
        pr.commits.nodes[0]?.commit.statusCheckRollup.contexts.nodes[0];
      if (!check) throw new Error('Missing fixture check');
      check.conclusion = conclusion;
      expect(() => checkFeatureMerge(pr, [[review()]])).toThrow('CI test');
    },
  );

  it('refuses a head without a successful codecov/patch status', () => {
    const pr = pullRequest();
    const contexts = pr.commits.nodes[0]?.commit.statusCheckRollup.contexts;
    if (!contexts) throw new Error('Missing fixture');
    // ADR-020: patch coverage is the one coverage gate, so its absence (a
    // failed or skipped upload) must block like a red status would.
    contexts.nodes = contexts.nodes.filter(
      (check) => !('name' in check) || check.name !== 'codecov/patch',
    );

    expect(() => checkFeatureMerge(pr, [[review()]])).toThrow(
      'codecov/patch has not succeeded',
    );
  });

  function withoutCodecov(paths: string[], hasNextPage = false) {
    const pr = pullRequest();
    const contexts = pr.commits.nodes[0]?.commit.statusCheckRollup.contexts;
    if (!contexts) throw new Error('Missing fixture');
    contexts.nodes = contexts.nodes.filter(
      (check) => !('name' in check) || check.name !== 'codecov/patch',
    );
    pr.files = {
      nodes: paths.map((path) => ({ path })),
      pageInfo: { hasNextPage },
    };
    return pr;
  }

  // ADR-020 amendment (2026-09-28): Dependabot PRs run without secrets, so
  // Codecov cannot post on them, and a change to dependency manifests or CI
  // workflows has no line that coverage measures.
  it('accepts a missing codecov/patch when only dependency manifests or workflows change', () => {
    const pr = withoutCodecov([
      'package.json',
      'pnpm-lock.yaml',
      '.github/workflows/ci.yml',
    ]);

    expect(checkFeatureMerge(pr, [[review()]])).toMatchObject({
      number: 987,
      head: HEAD,
    });
  });

  it('still requires codecov/patch when any other file changes', () => {
    const pr = withoutCodecov(['package.json', 'src/example.ts']);

    expect(() => checkFeatureMerge(pr, [[review()]])).toThrow(
      'codecov/patch has not succeeded',
    );
  });

  it('still requires codecov/patch when the changed-file list is truncated', () => {
    const pr = withoutCodecov(['pnpm-lock.yaml'], true);

    expect(() => checkFeatureMerge(pr, [[review()]])).toThrow(
      'codecov/patch has not succeeded',
    );
  });

  it('still refuses a failed codecov/patch for a dependency-only change', () => {
    const pr = pullRequest();
    pr.files = {
      nodes: [{ path: 'pnpm-lock.yaml' }],
      pageInfo: { hasNextPage: false },
    };
    const codecov =
      pr.commits.nodes[0]?.commit.statusCheckRollup.contexts.nodes.find(
        (check) => 'name' in check && check.name === 'codecov/patch',
      );
    if (!codecov || !('conclusion' in codecov))
      throw new Error('Missing fixture');
    codecov.conclusion = 'FAILURE';

    expect(() => checkFeatureMerge(pr, [[review()]])).toThrow();
  });

  it('refuses another failing check', () => {
    const pr = pullRequest();
    const check =
      pr.commits.nodes[0]?.commit.statusCheckRollup.contexts.nodes[1];
    if (!check) throw new Error('Missing fixture check');
    check.state = 'FAILURE';
    expect(() => checkFeatureMerge(pr, [[review()]])).toThrow('checks');
  });

  it('fails closed on malformed API data', () => {
    expect(() => checkFeatureMerge({}, [[review()]])).toThrow('Invalid GitHub');
    expect(() => checkFeatureMerge(pullRequest(), [{}])).toThrow(
      'Invalid GitHub',
    );
  });
});

describe('merge command', () => {
  function responses() {
    vi.mocked(execFileSync)
      .mockReturnValueOnce(
        JSON.stringify({
          data: { repository: { pullRequest: pullRequest() } },
        }),
      )
      .mockReturnValueOnce(JSON.stringify([[review()]]))
      .mockReturnValueOnce('')
      .mockReturnValueOnce('merged');
  }

  it('checks without merging by default', () => {
    responses();
    runMergeReviewedPr(['987'], () => {});
    expect(execFileSync).toHaveBeenCalledTimes(2);
    expect(vi.mocked(execFileSync).mock.calls[1]?.[1]).toEqual(
      expect.arrayContaining(['--paginate', '--slurp']),
    );
  });

  it('refuses an API response for another PR before merging', () => {
    responses();
    expect(() => runMergeReviewedPr(['988', '--merge'], () => {})).toThrow(
      'PR number',
    );
    expect(execFileSync).toHaveBeenCalledTimes(2);
  });

  it('exits nonzero for unsupported direct CLI arguments without calling GitHub', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/merge-reviewed-pr.ts', '--admin'],
      { encoding: 'utf8', timeout: 2_000 },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Usage: tsx scripts/merge-reviewed-pr.ts');
  });

  it('binds an explicitly requested merge commit to the verified head', () => {
    responses();
    runMergeReviewedPr(['987', '--merge'], () => {});
    expect(execFileSync).toHaveBeenLastCalledWith(
      'gh',
      [
        'pr',
        'merge',
        '987',
        '--repo',
        'The-Obstacle-Is-The-Way/naltrexone-university',
        '--merge',
        '--match-head-commit',
        HEAD,
      ],
      expect.any(Object),
    );
  });

  it('keeps the verified receipt on the PR before merging', () => {
    responses();
    runMergeReviewedPr(['987', '--merge'], () => {});
    const calls = vi.mocked(execFileSync).mock.calls;
    expect(calls.map(([, args]) => args?.slice(0, 2))).toEqual([
      ['api', 'graphql'],
      ['api', '--paginate'],
      ['pr', 'comment'],
      ['pr', 'merge'],
    ]);
    expect(calls[2]?.[1]).toEqual([
      'pr',
      'comment',
      '987',
      '--repo',
      'The-Obstacle-Is-The-Way/naltrexone-university',
      '--body-file',
      '-',
    ]);
    expect(calls[2]?.[2]).toMatchObject({
      input: expect.stringContaining(`"head":"${HEAD}"`),
    });
  });

  it('never calls merge after a missing approval', () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce(
        JSON.stringify({
          data: { repository: { pullRequest: pullRequest() } },
        }),
      )
      .mockReturnValueOnce(JSON.stringify([[review('APPROVED', OLD_HEAD)]]));
    expect(() => runMergeReviewedPr(['987', '--merge'], () => {})).toThrow(
      'exact-head',
    );
    expect(execFileSync).toHaveBeenCalledTimes(2);
  });

  it.each([[], ['987', '--admin'], ['bad'], ['987', '--merge', '--merge']])(
    'refuses unsupported arguments %j before API calls',
    (...args) => {
      expect(() => runMergeReviewedPr(args, () => {})).toThrow('Usage');
      expect(execFileSync).not.toHaveBeenCalled();
    },
  );
});
