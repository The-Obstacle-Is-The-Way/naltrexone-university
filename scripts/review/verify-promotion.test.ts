import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { REPOSITORY } from './merge-policy';
import { GitHistory, ReviewHost } from './review-command-test-helpers';
import {
  checkPromotionReadiness,
  checkSourceProvenance,
  createPromotionCommand,
  firstParentMerges,
  sourcePrNumber,
  withPromotionReceipt,
} from './verify-promotion';

const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
const MERGE = 'c'.repeat(40);
const REPOSITORY_API = `repos/${REPOSITORY}`;
const source = (pushedAt = '2026-09-22T03:10:00Z', commitOid = HEAD) => ({
  number: 987,
  state: 'MERGED',
  baseRefName: 'dev',
  headRefName: 'feature',
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
  function fixture(sourceNumber = 987) {
    const events: Array<{ file: string; args: string[] }> = [];
    const host = new ReviewHost(events);
    const git = new GitHistory(events);
    const pr = promotion();
    pr.headRefOid = MERGE;
    const commit = pr.commits.nodes[0]?.commit;
    if (!commit) throw new Error('Missing fixture');
    commit.oid = MERGE;
    host.prs.set('990', pr);
    host.prs.set('987', { ...source(), number: sourceNumber });
    host.api.set(`${REPOSITORY_API}/pulls/990/reviews?per_page=100`, [[]]);
    host.api.set(`${REPOSITORY_API}/pulls/987/reviews?per_page=100`, reviews());
    host.api.set(`${REPOSITORY_API}/commits/${MERGE}/pulls?per_page=100`, [
      [{ number: 987, merge_commit_sha: MERGE }],
    ]);
    host.bodies.set('990', 'Promotion summary\n');
    git.replies.set(
      `--no-pager rev-list --first-parent --reverse --parents ${BASE}..${MERGE}`,
      `${MERGE} ${BASE} ${HEAD}\n`,
    );
    return {
      host,
      git,
      pr,
      events,
      run: createPromotionCommand({ gh: host.gh, git: git.run }),
    };
  }
  it('prints a SHA-bound source receipt without requesting review or merging', () => {
    const { host, git, run } = fixture();
    const output: string[] = [];
    run(['990'], (value) => output.push(value));
    for (const value of [
      `Head: \`${MERGE}\``,
      `Base: \`${BASE}\``,
      '| #987 |',
      HEAD,
      '123',
    ])
      expect(output.join('\n')).toContain(value);
    expect(git.calls).toEqual([
      ['--no-pager', 'merge-base', '--is-ancestor', BASE, MERGE],
      [
        '--no-pager',
        'rev-list',
        '--first-parent',
        '--reverse',
        '--parents',
        `${BASE}..${MERGE}`,
      ],
    ]);
    expect(host.calls.every(({ args }) => args[0] === 'api')).toBe(true);
    expect(host.merges).toEqual([]);
  });
  it('compares a carried source approval against the merge’s first parent and shows the carry', () => {
    const { host, run } = fixture();
    const approvedHead = 'd'.repeat(40);
    host.prs.set('987', {
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
              nodes: [{ createdAt, branch: { name: 'feature' } }],
            },
          },
        })),
      },
    });
    const files = {
      merge_base_commit: { sha: BASE },
      files: [{ filename: 'src/a.ts', status: 'modified', patch: '+x' }],
    };
    host.api.set(`${REPOSITORY_API}/compare/${BASE}...${approvedHead}`, files);
    host.api.set(`${REPOSITORY_API}/compare/${BASE}...${HEAD}`, files);
    const output: string[] = [];
    run(['990'], (value) => output.push(value));
    expect(host.calls.slice(-2).map(({ args }) => args)).toEqual([
      ['api', `${REPOSITORY_API}/compare/${BASE}...${approvedHead}`],
      ['api', `${REPOSITORY_API}/compare/${BASE}...${HEAD}`],
    ]);
    expect(output.join('\n')).toContain(
      `| ${HEAD} (carried from ${approvedHead}) |`,
    );
  });
  it('does not emit a passing receipt when ancestry cannot be proved', () => {
    const { git, run } = fixture();
    git.ancestryError = new Error('not an ancestor');
    const output: string[] = [];
    expect(() => run(['990'], (value) => output.push(value))).toThrow(
      'not an ancestor',
    );
    expect(output).toEqual([]);
  });
  it('refuses a response for another promotion', () => {
    const { host, pr, run } = fixture();
    host.prs.set('991', pr);
    host.api.set(`${REPOSITORY_API}/pulls/991/reviews?per_page=100`, [[]]);
    expect(() => run(['991'], () => {})).toThrow('number');
    expect(host.calls).toHaveLength(2);
  });
  it('refuses source evidence for a different PR', () => {
    expect(() => fixture(988).run(['990'], () => {})).toThrow(
      'Source PR number',
    );
  });
  it('records the receipt in the promotion body before merging the verified head', () => {
    const { host, git, events, run } = fixture();
    const output: string[] = [];
    run(['990', '--merge'], (value) => output.push(value));
    expect(git.calls[0]).toEqual(['fetch', '--quiet', 'origin']);
    expect(events[0]).toEqual({
      file: 'git',
      args: ['fetch', '--quiet', 'origin'],
    });
    expect(host.calls.slice(-6, -3).map(({ args }) => args.join(' '))).toEqual([
      `pr view 990 --repo ${REPOSITORY} --json body --jq .body`,
      `pr edit 990 --repo ${REPOSITORY} --body-file -`,
      `pr view 990 --repo ${REPOSITORY} --json body --jq .body`,
    ]);
    expect(host.calls.at(-3)?.args.slice(0, 2)).toEqual(['api', 'graphql']);
    expect(host.calls.at(-1)?.args.join(' ')).toBe(
      `pr merge 990 --repo ${REPOSITORY} --merge --match-head-commit ${MERGE}`,
    );
    expect(host.merges).toHaveLength(1);
    expect(host.merges[0]?.body).toMatch(
      /^Promotion summary\n\n<!-- verify-promotion:start -->\n## Reviewed promotion provenance[\s\S]*\| #987 \|[\s\S]*<!-- verify-promotion:end -->\n$/,
    );
    expect(output.at(-1)).toBe('merged\n');
  });
  it('does not merge when the promotion body does not show the receipt', () => {
    const { host, run } = fixture();
    host.ignoreEdits = true;
    expect(() => run(['990', '--merge'], () => {})).toThrow(
      'Promotion body does not show the receipt; refusing to merge',
    );
    expect(host.merges).toEqual([]);
  });
  it.each(['baseRefOid', 'headRefOid'] as const)(
    'does not merge when the promotion %s moved after verification',
    (field) => {
      const { host, pr, run } = fixture();
      host.afterEdit = () => {
        pr[field] = 'd'.repeat(40);
        if (field === 'headRefOid') {
          const commit = pr.commits.nodes[0]?.commit;
          if (commit) commit.oid = pr.headRefOid;
        }
      };
      expect(() => run(['990', '--merge'], () => {})).toThrow(
        'Promotion base or head changed; refusing to merge',
      );
      expect(host.merges).toEqual([]);
    },
  );
  it('does not merge when the marked section is stale although the receipt appears elsewhere', () => {
    const { host, run } = fixture();
    host.afterEdit = (number) => {
      const receipt = (host.bodies.get(number) ?? '')
        .split('<!-- verify-promotion:start -->\n')[1]
        ?.split('\n<!-- verify-promotion:end -->')[0];
      host.bodies.set(
        number,
        `<!-- verify-promotion:start -->\nOld\n<!-- verify-promotion:end -->\n${receipt}`,
      );
    };
    expect(() => run(['990', '--merge'], () => {})).toThrow(
      'Promotion body does not show the receipt; refusing to merge',
    );
    expect(host.merges).toEqual([]);
  });
  it.each([[], ['0'], ['990', '--force'], ['990', '--merge', 'now']])(
    'refuses unsupported proof arguments %j',
    (...args) => {
      const { host, git, run } = fixture();
      expect(() => run(args, () => {})).toThrow('Usage');
      expect(host.calls).toEqual([]);
      expect(git.calls).toEqual([]);
    },
  );
  it('fails direct invocation on invalid arguments', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/review/verify-promotion.ts', '--merge'],
      { encoding: 'utf8', timeout: 2_000 },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Usage: tsx scripts/review/verify-promotion.ts',
    );
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
