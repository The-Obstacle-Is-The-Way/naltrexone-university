import { execFileSync, spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkPromotionReadiness,
  checkSourceProvenance,
  firstParentMerges,
  runVerifyPromotion,
  sourcePrNumber,
} from './verify-promotion';

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFileSync: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());

const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
const MERGE = 'c'.repeat(40);
const source = () => ({
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
      { merge: MERGE, head: HEAD },
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

  it.each([[], ['0'], ['990', '--merge']])(
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
