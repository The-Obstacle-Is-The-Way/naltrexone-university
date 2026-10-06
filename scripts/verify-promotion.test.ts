import { execFileSync, spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REPOSITORY } from './merge-reviewed-pr';
import {
  checkPromotionReadiness,
  checkSourceProvenance,
  firstParentMerges,
  runVerifyPromotion,
  sourcePrNumber,
  withPromotionReceipt,
} from './verify-promotion';

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFileSync: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());

const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
const MERGE = 'c'.repeat(40);
const REPOSITORY_API = `repos/${REPOSITORY}`;
const source = (pushedAt = '2026-09-22T03:10:00Z', commitOid = HEAD) => ({
  number: 987,
  state: 'MERGED',
  baseRefName: 'dev',
  headRefOid: HEAD,
  mergeCommit: { oid: MERGE },
  mergedAt: '2026-09-22T03:24:23Z',
  reviewThreads: {
    nodes: [{ isResolved: true }],
    pageInfo: { hasNextPage: false },
  },
  commits: {
    nodes: [
      {
        commit: {
          oid: commitOid,
          checkSuites: {
            pageInfo: { hasNextPage: false },
            nodes: [{ createdAt: pushedAt }],
          },
        },
      },
    ],
  },
});
const reviews = (commit = HEAD, time = '2026-09-22T03:22:32Z') => [
  [
    {
      id: 123,
      user: { login: 'coderabbitai[bot]' },
      state: 'APPROVED',
      commit_id: commit,
      submitted_at: time,
    },
  ],
];
const promotion = () => ({
  number: 990,
  state: 'OPEN',
  isDraft: false,
  baseRefName: 'main',
  baseRefOid: BASE,
  headRefName: 'dev',
  headRefOid: HEAD,
  headRepository: {
    nameWithOwner: 'The-Obstacle-Is-The-Way/naltrexone-university',
  },
  mergeable: 'MERGEABLE',
  mergeStateStatus: 'UNSTABLE',
  reviewThreads: { nodes: [], pageInfo: { hasNextPage: false } },
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
                  state: 'PENDING',
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

describe('promotion readiness', () => {
  it('does not require another CodeRabbit check or approval for a promotion', () => {
    expect(checkPromotionReadiness(promotion())).toMatchObject({
      headRefOid: HEAD,
      baseRefOid: BASE,
    });
  });

  it.each([
    ['wrong source branch', { headRefName: 'feature' }],
    ['wrong target', { baseRefName: 'dev' }],
    [
      'foreign repository',
      { headRepository: { nameWithOwner: 'someone/fork' } },
    ],
    ['draft', { isDraft: true }],
    ['closed', { state: 'MERGED' }],
    ['outdated base', { mergeStateStatus: 'BEHIND' }],
    ['blocked review', { mergeStateStatus: 'BLOCKED' }],
  ])('refuses %s', (_name, changes) => {
    expect(() =>
      checkPromotionReadiness({ ...promotion(), ...changes }),
    ).toThrow();
  });

  it('still refuses unresolved promotion findings', () => {
    expect(() =>
      checkPromotionReadiness({
        ...promotion(),
        reviewThreads: {
          nodes: [{ isResolved: false }],
          pageInfo: { hasNextPage: false },
        },
      }),
    ).toThrow('unresolved');
  });

  it('requires a successful codecov/patch status on the promotion', () => {
    const pr = promotion();
    const contexts = pr.commits.nodes[0]?.commit.statusCheckRollup.contexts;
    if (!contexts) throw new Error('Missing fixture');
    contexts.nodes = contexts.nodes.filter(
      (check) => !('name' in check) || check.name !== 'codecov/patch',
    );

    expect(() => checkPromotionReadiness(pr)).toThrow(
      'codecov/patch has not succeeded',
    );
  });

  it('still requires successful main-promotion CI', () => {
    const pr = promotion();
    const check =
      pr.commits.nodes[0]?.commit.statusCheckRollup.contexts.nodes[0];
    if (!check) throw new Error('Missing fixture');
    check.conclusion = 'FAILURE';
    expect(() => checkPromotionReadiness(pr)).toThrow('CI test');
  });

  it.each(['checks', 'threads', 'head'])(
    'refuses incomplete %s evidence',
    (part) => {
      const pr = promotion();
      const commit = pr.commits.nodes[0]?.commit;
      if (!commit) throw new Error('Missing fixture');
      if (part === 'checks')
        commit.statusCheckRollup.contexts.pageInfo.hasNextPage = true;
      if (part === 'threads') pr.reviewThreads.pageInfo.hasNextPage = true;
      if (part === 'head') commit.oid = BASE;
      expect(() => checkPromotionReadiness(pr)).toThrow('Incomplete');
    },
  );

  it.each(['FAILURE', 'PENDING'])(
    'refuses another check with state %s',
    (state) => {
      const pr = promotion();
      const check =
        pr.commits.nodes[0]?.commit.statusCheckRollup.contexts.nodes[1];
      if (!check) throw new Error('Missing fixture');
      check.context = 'Vercel';
      check.state = state;
      expect(() => checkPromotionReadiness(pr)).toThrow(
        'Other promotion checks',
      );
    },
  );
});

describe('first-parent provenance', () => {
  it('retains the merge SHA and actual second-parent head', () => {
    expect(firstParentMerges(`${MERGE} ${BASE} ${HEAD}\n`)).toEqual([
      { merge: MERGE, base: BASE, head: HEAD },
    ]);
  });

  it.each([
    '',
    `${MERGE} ${BASE}`,
    `${MERGE} ${BASE} ${HEAD} ${BASE}`,
    'not git output',
  ])('refuses unprovable history %j', (text) => {
    expect(() => firstParentMerges(text)).toThrow();
  });

  it('selects the source PR by merge SHA, not by a commit-message guess', () => {
    expect(
      sourcePrNumber(MERGE, [
        [{ number: 984, merge_commit_sha: BASE }],
        [{ number: 987, merge_commit_sha: MERGE }],
      ]),
    ).toBe(987);
  });

  it.each([
    [],
    [[{ number: 987, merge_commit_sha: BASE }]],
    [
      [
        { number: 987, merge_commit_sha: MERGE },
        { number: 988, merge_commit_sha: MERGE },
      ],
    ],
  ])('refuses missing or ambiguous PR association %j', (...pages) => {
    expect(() => sourcePrNumber(MERGE, pages)).toThrow();
  });

  it('proves approval preceded the source merge and threads are currently resolved', () => {
    expect(
      checkSourceProvenance({ merge: MERGE, head: HEAD }, source(), reviews()),
    ).toMatchObject({ number: 987, head: HEAD, merge: MERGE, approvalId: 123 });
  });

  it.each([
    ['wrong base', { baseRefName: 'main' }],
    ['unmerged source', { state: 'OPEN' }],
    ['wrong merge', { mergeCommit: { oid: BASE } }],
    ['head mismatch', { headRefOid: BASE }],
    [
      'unresolved source',
      {
        reviewThreads: {
          nodes: [{ isResolved: false }],
          pageInfo: { hasNextPage: false },
        },
      },
    ],
    [
      'truncated threads',
      { reviewThreads: { nodes: [], pageInfo: { hasNextPage: true } } },
    ],
  ])('refuses %s', (_name, changes) => {
    expect(() =>
      checkSourceProvenance(
        { merge: MERGE, head: HEAD },
        { ...source(), ...changes },
        reviews(),
      ),
    ).toThrow();
  });

  it('refuses a source approval GitHub carried onto a head pushed after it', () => {
    expect(() =>
      checkSourceProvenance(
        { merge: MERGE, head: HEAD },
        source('2026-09-22T03:23:00Z'),
        reviews(),
      ),
    ).toThrow('predates the push of the head');
  });

  it.each([
    ['check suites for a different commit', () => source(undefined, BASE)],
    [
      'no head commit in the response',
      () => {
        const { commits: _commits, ...rest } = source();
        return rest;
      },
    ],
  ])('cannot date the source push from %s', (_name, input) => {
    expect(() =>
      checkSourceProvenance({ merge: MERGE, head: HEAD }, input(), reviews()),
    ).toThrow('cannot date the push of the head');
  });

  // A source PR that merged dev after its approval: GitHub repointed the
  // approval to the merged head, and the PR's diff against dev just before
  // the merge is unchanged since the approved head.
  it('accepts a carried source approval whose reviewable diff is unchanged', () => {
    const files = [{ filename: 'src/a.ts', status: 'modified', patch: '+x' }];

    expect(
      checkSourceProvenance(
        { merge: MERGE, head: HEAD },
        source('2026-09-22T03:23:00Z'),
        reviews(),
        {
          reviewId: 123,
          approvedHead: BASE,
          approved: files,
          current: files,
          baseChanges: [],
        },
      ),
    ).toMatchObject({ head: HEAD, approvalId: 123, carriedFrom: BASE });
  });

  it('refuses a carried source approval whose reviewable diff changed', () => {
    expect(() =>
      checkSourceProvenance(
        { merge: MERGE, head: HEAD },
        source('2026-09-22T03:23:00Z'),
        reviews(),
        {
          reviewId: 123,
          approvedHead: BASE,
          approved: [{ filename: 'src/a.ts', status: 'modified', patch: '+x' }],
          current: [{ filename: 'src/a.ts', status: 'modified', patch: '+y' }],
          baseChanges: [],
        },
      ),
    ).toThrow('predates the push of the head');
  });

  it('refuses approval on a superseded source head', () => {
    expect(() =>
      checkSourceProvenance(
        { merge: MERGE, head: HEAD },
        source(),
        reviews(BASE),
      ),
    ).toThrow('exact-head');
  });

  it.each(['2026-09-22T03:24:23Z', '2026-09-22T03:30:00Z'])(
    'does not claim approval precedes merge without strict timestamp proof: %s',
    (time) => {
      expect(() =>
        checkSourceProvenance(
          { merge: MERGE, head: HEAD },
          source(),
          reviews(HEAD, time),
        ),
      ).toThrow('before');
    },
  );
});

describe('promotion proof command', () => {
  function responses(sourceNumber = 987) {
    const pr = promotion();
    pr.headRefOid = MERGE;
    const commit = pr.commits.nodes[0]?.commit;
    if (!commit) throw new Error('Missing fixture');
    commit.oid = MERGE;
    vi.mocked(execFileSync)
      .mockReturnValueOnce(
        JSON.stringify({ data: { repository: { pullRequest: pr } } }),
      )
      .mockReturnValueOnce(JSON.stringify([[]]))
      .mockReturnValueOnce('')
      .mockReturnValueOnce(`${MERGE} ${BASE} ${HEAD}\n`)
      .mockReturnValueOnce(
        JSON.stringify([[{ number: 987, merge_commit_sha: MERGE }]]),
      )
      .mockReturnValueOnce(
        JSON.stringify({
          data: {
            repository: { pullRequest: { ...source(), number: sourceNumber } },
          },
        }),
      )
      .mockReturnValueOnce(JSON.stringify(reviews()));
  }

  it('prints a SHA-bound source receipt without requesting review or merging', () => {
    responses();
    const output: string[] = [];
    runVerifyPromotion(['990'], (value) => output.push(value));
    expect(output.join('\n')).toContain(`Head: \`${MERGE}\``);
    expect(output.join('\n')).toContain(`Base: \`${BASE}\``);
    expect(output.join('\n')).toContain('| #987 |');
    expect(output.join('\n')).toContain(HEAD);
    expect(output.join('\n')).toContain('123');
    const commands = vi
      .mocked(execFileSync)
      .mock.calls.map(([file, args]) => ({ file, args }));
    expect(commands).toContainEqual({
      file: 'git',
      args: ['--no-pager', 'merge-base', '--is-ancestor', BASE, MERGE],
    });
    expect(commands).toContainEqual({
      file: 'git',
      args: [
        '--no-pager',
        'rev-list',
        '--first-parent',
        '--reverse',
        '--parents',
        `${BASE}..${MERGE}`,
      ],
    });
    expect(
      commands
        .filter(({ file }) => file === 'gh')
        .every(({ args }) => args?.[0] === 'api'),
    ).toBe(true);
  });

  it('compares a carried source approval against the merge’s first parent and shows the carry', () => {
    const approvedHead = 'd'.repeat(40);
    const pr = promotion();
    pr.headRefOid = MERGE;
    const commit = pr.commits.nodes[0]?.commit;
    if (!commit) throw new Error('Missing fixture');
    commit.oid = MERGE;
    const merged = {
      ...source('2026-09-22T03:23:00Z'),
      pushes: {
        pageInfo: { hasPreviousPage: false },
        nodes: [
          [approvedHead, '2026-09-22T03:10:00Z'],
          [HEAD, '2026-09-22T03:23:00Z'],
        ].map(([oid, createdAt]) => ({
          commit: {
            oid,
            checkSuites: {
              pageInfo: { hasNextPage: false },
              nodes: [{ createdAt }],
            },
          },
        })),
      },
    };
    const files = JSON.stringify({
      merge_base_commit: { sha: BASE },
      files: [{ filename: 'src/a.ts', status: 'modified', patch: '+x' }],
    });
    vi.mocked(execFileSync)
      .mockReturnValueOnce(
        JSON.stringify({ data: { repository: { pullRequest: pr } } }),
      )
      .mockReturnValueOnce(JSON.stringify([[]]))
      .mockReturnValueOnce('')
      .mockReturnValueOnce(`${MERGE} ${BASE} ${HEAD}\n`)
      .mockReturnValueOnce(
        JSON.stringify([[{ number: 987, merge_commit_sha: MERGE }]]),
      )
      .mockReturnValueOnce(
        JSON.stringify({ data: { repository: { pullRequest: merged } } }),
      )
      .mockReturnValueOnce(JSON.stringify(reviews()))
      .mockReturnValueOnce(files)
      .mockReturnValueOnce(files);
    const output: string[] = [];

    runVerifyPromotion(['990'], (value) => output.push(value));

    const calls = vi.mocked(execFileSync).mock.calls;
    expect(calls[7]?.[1]).toEqual([
      'api',
      `${REPOSITORY_API}/compare/${BASE}...${approvedHead}`,
    ]);
    expect(calls[8]?.[1]).toEqual([
      'api',
      `${REPOSITORY_API}/compare/${BASE}...${HEAD}`,
    ]);
    expect(output.join('\n')).toContain(
      `| ${HEAD} (carried from ${approvedHead}) |`,
    );
  });

  it('does not emit a passing receipt when ancestry cannot be proved', () => {
    const pr = promotion();
    vi.mocked(execFileSync)
      .mockReturnValueOnce(
        JSON.stringify({ data: { repository: { pullRequest: pr } } }),
      )
      .mockReturnValueOnce(JSON.stringify([[]]))
      .mockImplementationOnce(() => {
        throw new Error('not an ancestor');
      });
    const output: string[] = [];
    expect(() =>
      runVerifyPromotion(['990'], (value) => output.push(value)),
    ).toThrow('not an ancestor');
    expect(output).toEqual([]);
  });

  it('refuses a response for another promotion', () => {
    responses();
    expect(() => runVerifyPromotion(['991'], () => {})).toThrow('number');
    expect(execFileSync).toHaveBeenCalledTimes(2);
  });

  it('refuses source evidence for a different PR', () => {
    responses(988);
    expect(() => runVerifyPromotion(['990'], () => {})).toThrow(
      'Source PR number',
    );
  });

  it('records the receipt in the promotion body before merging the verified head', () => {
    vi.mocked(execFileSync).mockReturnValueOnce('');
    responses();
    const verified = promotion();
    verified.headRefOid = MERGE;
    const verifiedCommit = verified.commits.nodes[0]?.commit;
    if (!verifiedCommit) throw new Error('Missing fixture');
    verifiedCommit.oid = MERGE;
    const recorded: string[] = [];
    vi.mocked(execFileSync)
      .mockReturnValueOnce('Promotion summary\n')
      .mockImplementationOnce((_file, _args, options) => {
        recorded.push(String((options as { input?: string }).input));
        return '';
      })
      .mockImplementationOnce(() => recorded[0] ?? '')
      .mockReturnValueOnce(
        JSON.stringify({ data: { repository: { pullRequest: verified } } }),
      )
      .mockReturnValueOnce(JSON.stringify([[]]))
      .mockReturnValueOnce('merged\n');
    const output: string[] = [];

    runVerifyPromotion(['990', '--merge'], (value) => output.push(value));

    const commands = vi
      .mocked(execFileSync)
      .mock.calls.map(([file, args]) => [file, ...(args ?? [])].join(' '));
    expect(commands[0]).toBe('git fetch --quiet origin');
    expect(commands.slice(-6, -3)).toEqual([
      `gh pr view 990 --repo ${REPOSITORY} --json body --jq .body`,
      `gh pr edit 990 --repo ${REPOSITORY} --body-file -`,
      `gh pr view 990 --repo ${REPOSITORY} --json body --jq .body`,
    ]);
    // The PR is re-read after the body shows the proof and before the merge.
    expect(commands.at(-3)).toMatch(/^gh api graphql /);
    expect(commands.at(-1)).toBe(
      `gh pr merge 990 --repo ${REPOSITORY} --merge --match-head-commit ${MERGE}`,
    );
    expect(recorded[0]).toMatch(
      /^Promotion summary\n\n<!-- verify-promotion:start -->\n## Reviewed promotion provenance[\s\S]*\| #987 \|[\s\S]*<!-- verify-promotion:end -->\n$/,
    );
    expect(output.at(-1)).toBe('merged\n');
  });

  it('does not merge when the promotion body does not show the receipt', () => {
    vi.mocked(execFileSync).mockReturnValueOnce('');
    responses();
    vi.mocked(execFileSync)
      .mockReturnValueOnce('Promotion summary\n')
      .mockReturnValueOnce('')
      .mockReturnValueOnce('Promotion summary\n');

    expect(() => runVerifyPromotion(['990', '--merge'], () => {})).toThrow(
      'Promotion body does not show the receipt; refusing to merge',
    );
    expect(
      vi
        .mocked(execFileSync)
        .mock.calls.some(([, args]) => args?.[1] === 'merge'),
    ).toBe(false);
  });

  it('does not merge when the promotion base moved after verification', () => {
    vi.mocked(execFileSync).mockReturnValueOnce('');
    responses();
    const recorded: string[] = [];
    const moved = promotion();
    moved.headRefOid = MERGE;
    moved.baseRefOid = 'd'.repeat(40);
    const movedCommit = moved.commits.nodes[0]?.commit;
    if (!movedCommit) throw new Error('Missing fixture');
    movedCommit.oid = MERGE;
    vi.mocked(execFileSync)
      .mockReturnValueOnce('Promotion summary\n')
      .mockImplementationOnce((_file, _args, options) => {
        recorded.push(String((options as { input?: string }).input));
        return '';
      })
      .mockImplementationOnce(() => recorded[0] ?? '')
      .mockReturnValueOnce(
        JSON.stringify({ data: { repository: { pullRequest: moved } } }),
      )
      .mockReturnValueOnce(JSON.stringify([[]]));

    expect(() => runVerifyPromotion(['990', '--merge'], () => {})).toThrow(
      'Promotion base or head changed; refusing to merge',
    );
    expect(
      vi
        .mocked(execFileSync)
        .mock.calls.some(([, args]) => args?.[1] === 'merge'),
    ).toBe(false);
  });

  it('does not merge when the marked section is stale although the receipt appears elsewhere', () => {
    vi.mocked(execFileSync).mockReturnValueOnce('');
    responses();
    const recorded: string[] = [];
    vi.mocked(execFileSync)
      .mockReturnValueOnce('Promotion summary\n')
      .mockImplementationOnce((_file, _args, options) => {
        recorded.push(String((options as { input?: string }).input));
        return '';
      })
      .mockImplementationOnce(() => {
        const receipt = (recorded[0] ?? '')
          .split('<!-- verify-promotion:start -->\n')[1]
          ?.split('\n<!-- verify-promotion:end -->')[0];
        return `<!-- verify-promotion:start -->\nOld\n<!-- verify-promotion:end -->\n${receipt}`;
      });

    expect(() => runVerifyPromotion(['990', '--merge'], () => {})).toThrow(
      'Promotion body does not show the receipt; refusing to merge',
    );
    expect(
      vi
        .mocked(execFileSync)
        .mock.calls.some(([, args]) => args?.[1] === 'merge'),
    ).toBe(false);
  });

  it.each([[], ['0'], ['990', '--force'], ['990', '--merge', 'now']])(
    'refuses unsupported proof arguments %j',
    (...args) => {
      expect(() => runVerifyPromotion(args, () => {})).toThrow('Usage');
      expect(execFileSync).not.toHaveBeenCalled();
    },
  );

  it('fails direct invocation on invalid arguments', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/verify-promotion.ts', '--merge'],
      { encoding: 'utf8', timeout: 2_000 },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Usage: tsx scripts/verify-promotion.ts');
  });
});

describe('promotion body receipt', () => {
  const START = '<!-- verify-promotion:start -->';
  const END = '<!-- verify-promotion:end -->';

  it('appends the receipt section to a body without one', () => {
    expect(withPromotionReceipt('Summary\n\n', 'Receipt')).toBe(
      `Summary\n\n${START}\nReceipt\n${END}\n`,
    );
  });

  it('replaces an earlier receipt instead of stacking a second one', () => {
    expect(
      withPromotionReceipt(`Summary\n\n${START}\nOld\n${END}\nTail\n`, 'New'),
    ).toBe(`Summary\n\n${START}\nNew\n${END}\nTail\n`);
  });

  it.each([
    `${END}\n${START}`,
    `${START}\nOld`,
    `${END}\nOld`,
    `${START}\nA\n${END}\n${START}\nB\n${END}`,
  ])('fails closed on malformed receipt markers %j', (body) => {
    expect(() => withPromotionReceipt(body, 'New')).toThrow(
      'Malformed promotion receipt markers',
    );
  });
});
