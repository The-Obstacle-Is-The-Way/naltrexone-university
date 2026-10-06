import { execFileSync, spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkCarriesMain,
  checkFeatureMerge,
  runMergeReviewedPr,
} from './merge-reviewed-pr';
import {
  HEAD,
  MAIN,
  OLD_HEAD,
  pullRequest,
  pushedAt,
  pushes,
  review,
} from './merge-reviewed-pr-test-helpers';

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFileSync: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());

const REPO = 'repos/The-Obstacle-Is-The-Way/naltrexone-university';
// GitHub's compare of main against a ref: behind_by counts main's commits
// the ref lacks (DEBT-491).
const compareWithMain = (behind = 0) =>
  JSON.stringify({ behind_by: behind, base_commit: { sha: MAIN } });
// GitHub's compare of a base with a head: the head's changes since their merge
// base.
const compared = (files: unknown[], mergeBase = MAIN) =>
  JSON.stringify({ merge_base_commit: { sha: mergeBase }, files });
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

  // GitHub keeps an approval when a later push only merges the base branch,
  // and repoints it to the new head (changelog 2023-06-06). An approval
  // submitted before the head was pushed cannot have reviewed that head.
  it('refuses an approval GitHub carried onto a head pushed after it', () => {
    const pr = pullRequest(pushedAt('2026-09-22T04:00:00Z'));

    expect(() => checkFeatureMerge(pr, [[review()]])).toThrow(
      'predates the push of the head',
    );
  });

  it('dates the push by the earliest GitHub Actions check suite', () => {
    const pr = pullRequest(
      pushedAt('2026-09-22T04:00:00Z', '2026-09-22T02:30:00Z'),
    );

    expect(checkFeatureMerge(pr, [[review()]])).toMatchObject({ head: HEAD });
  });

  it.each([
    [
      'no GitHub Actions check suite',
      { pageInfo: { hasNextPage: false }, nodes: [] },
    ],
    [
      'a truncated check-suite list',
      {
        pageInfo: { hasNextPage: true },
        nodes: [{ createdAt: '2026-09-22T02:00:00Z' }],
      },
    ],
  ])('fails closed on %s', (_name, checkSuites) => {
    expect(() =>
      checkFeatureMerge(pullRequest(checkSuites), [[review()]]),
    ).toThrow('cannot date the push of the head');
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

  // ADR-020 amendment (2026-10-05, DEBT-497): documentation and
  // repository-tool configuration are just as unmeasured, so a Codecov outage
  // need not hold them.
  it('accepts a missing codecov/patch when only documentation or repository-tool configuration changes', () => {
    const pr = withoutCodecov([
      'docs/debt/index.md',
      'AGENTS.md',
      '.coderabbit.yaml',
      'codecov.yml',
    ]);

    expect(checkFeatureMerge(pr, [[review()]])).toMatchObject({
      number: 987,
      head: HEAD,
    });
  });

  it('still requires codecov/patch when documentation changes with code', () => {
    const pr = withoutCodecov(['docs/debt/index.md', 'scripts/example.ts']);

    expect(() => checkFeatureMerge(pr, [[review()]])).toThrow(
      'codecov/patch has not succeeded',
    );
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

// CodeRabbit reviews a Dependabot PR once, when it opens, and skips a later
// rebase whose only new change is the lockfile, which its path filters exclude.
// Its approval carries to the rebased head only when every other file's diff is
// byte-identical at both heads.
describe("dev keeps main's promotion history (DEBT-491)", () => {
  it('accepts a PR head that contains main', () => {
    expect(checkCarriesMain({ main: MAIN, headContainsMain: true })).toBe(
      'head',
    );
  });

  it('accepts a dev that already contains main', () => {
    expect(
      checkCarriesMain({
        main: MAIN,
        headContainsMain: false,
        devContainsMain: true,
      }),
    ).toBe('dev');
  });

  it('refuses when neither the PR head nor dev contains main', () => {
    expect(() =>
      checkCarriesMain({
        main: MAIN,
        headContainsMain: false,
        devContainsMain: false,
      }),
    ).toThrow(
      `Merging would leave dev without main's latest promotion (${MAIN.slice(0, 8)}): base the branch on origin/main, or merge origin/main into it`,
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
      .mockReturnValueOnce(compareWithMain())
      .mockReturnValueOnce('')
      .mockReturnValueOnce('merged');
  }

  it('checks without merging by default', () => {
    responses();
    const receipt = runMergeReviewedPr(['987'], () => {});
    expect(execFileSync).toHaveBeenCalledTimes(3);
    expect(vi.mocked(execFileSync).mock.calls[1]?.[1]).toEqual(
      expect.arrayContaining(['--paginate', '--slurp']),
    );
    expect(vi.mocked(execFileSync).mock.calls[2]?.[1]).toEqual([
      'api',
      `${REPO}/compare/main...${HEAD}`,
    ]);
    expect(receipt).toMatchObject({ carriesMain: 'head' });
  });

  it("refuses a merge that would leave dev without main's promotion, before any receipt", () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce(
        JSON.stringify({
          data: { repository: { pullRequest: pullRequest() } },
        }),
      )
      .mockReturnValueOnce(JSON.stringify([[review()]]))
      .mockReturnValueOnce(compareWithMain(2))
      .mockReturnValueOnce(compareWithMain(1));

    expect(() => runMergeReviewedPr(['987', '--merge'], () => {})).toThrow(
      'merge origin/main into it',
    );
    expect(execFileSync).toHaveBeenCalledTimes(4);
  });

  it('accepts a PR whose head lacks main when dev contains it, comparing against the same main', () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce(
        JSON.stringify({
          data: { repository: { pullRequest: pullRequest() } },
        }),
      )
      .mockReturnValueOnce(JSON.stringify([[review()]]))
      .mockReturnValueOnce(compareWithMain(1))
      .mockReturnValueOnce(compareWithMain(0));

    const receipt = runMergeReviewedPr(['987'], () => {});

    expect(receipt).toMatchObject({ carriesMain: 'dev' });
    expect(vi.mocked(execFileSync).mock.calls[3]?.[1]).toEqual([
      'api',
      `${REPO}/compare/${MAIN}...dev`,
    ]);
  });

  it('refuses an API response for another PR before merging', () => {
    responses();
    expect(() => runMergeReviewedPr(['988', '--merge'], () => {})).toThrow(
      'PR number',
    );
    expect(execFileSync).toHaveBeenCalledTimes(2);
  });

  it('reads both diffs for a rebased Dependabot PR and records the carried approval', () => {
    const pr = pullRequest();
    pr.files = {
      nodes: [{ path: 'package.json' }, { path: 'pnpm-lock.yaml' }],
      pageInfo: { hasNextPage: false },
    };
    const manifest = {
      filename: 'package.json',
      status: 'modified',
      patch: '-"a": "1"\n+"a": "2"',
    };
    vi.mocked(execFileSync)
      .mockReturnValueOnce(
        JSON.stringify({ data: { repository: { pullRequest: pr } } }),
      )
      .mockReturnValueOnce(JSON.stringify([[review('APPROVED', OLD_HEAD)]]))
      .mockReturnValueOnce(
        compared([
          manifest,
          { filename: 'pnpm-lock.yaml', status: 'modified', patch: 'x' },
        ]),
      )
      .mockReturnValueOnce(
        compared([
          manifest,
          { filename: 'pnpm-lock.yaml', status: 'modified', patch: 'y' },
        ]),
      )
      .mockReturnValueOnce(compareWithMain());

    const receipt = runMergeReviewedPr(['987'], () => {});

    expect(receipt).toMatchObject({ carriedFrom: OLD_HEAD, head: HEAD });
    expect(vi.mocked(execFileSync).mock.calls[2]?.[1]).toEqual([
      'api',
      `repos/The-Obstacle-Is-The-Way/naltrexone-university/compare/dev...${OLD_HEAD}`,
    ]);
    expect(vi.mocked(execFileSync).mock.calls[3]?.[1]).toEqual([
      'api',
      `repos/The-Obstacle-Is-The-Way/naltrexone-university/compare/dev...${HEAD}`,
    ]);
  });

  describe('an approval GitHub repointed onto a later head', () => {
    const earlierBase = 'd'.repeat(40);
    const laterBase = 'e'.repeat(40);
    const pr = () => ({
      ...pullRequest(pushedAt('2026-09-22T04:00:00Z')),
      ...pushes(
        [OLD_HEAD, '2026-09-22T02:00:00Z'],
        [HEAD, '2026-09-22T04:00:00Z'],
      ),
    });
    const change = (start: number) => [
      {
        filename: 'AGENTS.md',
        status: 'modified',
        patch: `@@ -${start},2 +${start},2 @@\n a\n-b\n+c`,
      },
    ];
    // dev inserted four lines after line 1 between the two merge bases.
    const devInserted = [
      {
        filename: 'AGENTS.md',
        status: 'modified',
        patch: '@@ -1,1 +1,5 @@\n x\n+1\n+2\n+3\n+4',
      },
    ];
    const respond = (baseChangesMergeBase: string) =>
      vi
        .mocked(execFileSync)
        .mockReturnValueOnce(
          JSON.stringify({ data: { repository: { pullRequest: pr() } } }),
        )
        .mockReturnValueOnce(JSON.stringify([[review()]]))
        .mockReturnValueOnce(compared(change(10), earlierBase))
        .mockReturnValueOnce(compared(change(14), laterBase))
        .mockReturnValueOnce(compared(devInserted, baseChangesMergeBase))
        .mockReturnValueOnce(compareWithMain());

    it('reads both diffs and dev’s changes between their merge bases', () => {
      respond(earlierBase);

      const receipt = runMergeReviewedPr(['987'], () => {});

      expect(receipt).toMatchObject({ carriedFrom: OLD_HEAD, head: HEAD });
      expect(
        vi
          .mocked(execFileSync)
          .mock.calls.slice(2, 5)
          .map((call) => call[1]),
      ).toEqual([
        ['api', `${REPO}/compare/dev...${OLD_HEAD}`],
        ['api', `${REPO}/compare/dev...${HEAD}`],
        ['api', `${REPO}/compare/${earlierBase}...${laterBase}`],
      ]);
    });

    it('refuses to carry when the earlier merge base is not in the later one', () => {
      respond('f'.repeat(40));

      expect(() => runMergeReviewedPr(['987'], () => {})).toThrow(
        'predates the push of the head',
      );
      expect(execFileSync).toHaveBeenCalledTimes(5);
    });
  });

  it('reads no diffs for a PR approved after its current head was pushed', () => {
    const pr = {
      ...pullRequest(),
      ...pushes(
        [OLD_HEAD, '2026-09-22T01:00:00Z'],
        [HEAD, '2026-09-22T02:00:00Z'],
      ),
    };
    vi.mocked(execFileSync)
      .mockReturnValueOnce(
        JSON.stringify({ data: { repository: { pullRequest: pr } } }),
      )
      .mockReturnValueOnce(JSON.stringify([[review('APPROVED', HEAD)]]))
      .mockReturnValueOnce(compareWithMain());

    const receipt = runMergeReviewedPr(['987'], () => {});

    expect(receipt).not.toHaveProperty('carriedFrom');
    expect(execFileSync).toHaveBeenCalledTimes(3);
  });

  it('refuses to carry when a compare reaches GitHub’s 300-file ceiling', () => {
    const pr = pullRequest();
    vi.mocked(execFileSync)
      .mockReturnValueOnce(
        JSON.stringify({ data: { repository: { pullRequest: pr } } }),
      )
      .mockReturnValueOnce(JSON.stringify([[review('APPROVED', OLD_HEAD)]]))
      .mockReturnValueOnce(
        compared(
          Array.from({ length: 300 }, (_, index) => ({
            filename: `file-${index}.ts`,
            status: 'modified',
            patch: 'x',
          })),
        ),
      );

    expect(() => runMergeReviewedPr(['987', '--merge'], () => {})).toThrow(
      'may be truncated',
    );
    expect(execFileSync).toHaveBeenCalledTimes(3);
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
      ['api', `${REPO}/compare/main...${HEAD}`],
      ['pr', 'comment'],
      ['pr', 'merge'],
    ]);
    expect(calls[3]?.[1]).toEqual([
      'pr',
      'comment',
      '987',
      '--repo',
      'The-Obstacle-Is-The-Way/naltrexone-university',
      '--body-file',
      '-',
    ]);
    expect(calls[3]?.[2]).toMatchObject({
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
      .mockReturnValueOnce(JSON.stringify([[review('CHANGES_REQUESTED')]]));
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
