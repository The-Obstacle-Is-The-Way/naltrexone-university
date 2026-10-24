// GitHub API responses shared by the merge-command tests.
export const HEAD = 'a'.repeat(40);
export const OLD_HEAD = 'b'.repeat(40);
export const MAIN = 'c'.repeat(40);
export const review = (state = 'APPROVED', commit = HEAD) => ({
  id: 123,
  user: { login: 'coderabbitai[bot]' },
  state,
  commit_id: commit,
  submitted_at: '2026-09-22T03:00:00Z',
});
// A page of PR or review-thread comments, as the merge query reads them.
export const commentPage = (
  ...nodes: { author: { login: string } | null; url: string; body: string }[]
) => ({ pageInfo: { hasNextPage: false }, nodes });
// A CodeRabbit reply that records a learning, in the form its chat replies use.
export const learningReply = (url: string, login = 'coderabbitai') => ({
  author: { login },
  url,
  body: [
    'Thanks for the clarification.',
    '<details>',
    '<summary>✏️ Learnings added</summary>',
    '',
    '```',
    'Learning: In this repository, a later review must not raise this again.',
    '```',
    '</details>',
  ].join('\n'),
});
export const HEAD_BRANCH = 'feature';
// The head commit's GitHub Actions check suites, created when it was pushed,
// on the PR's branch unless a suite names another.
type Suite = string | { createdAt: string; branch: string };
export const pushedAt = (...suites: Suite[]) => ({
  pageInfo: { hasNextPage: false },
  nodes: suites.map((suite) =>
    typeof suite === 'string'
      ? { createdAt: suite, branch: { name: HEAD_BRANCH } }
      : { createdAt: suite.createdAt, branch: { name: suite.branch } },
  ),
});
export const pullRequest = (
  checkSuites = pushedAt('2026-09-22T02:00:00Z'),
) => ({
  number: 987,
  state: 'OPEN',
  isDraft: false,
  baseRefName: 'dev',
  headRefName: HEAD_BRANCH,
  headRefOid: HEAD,
  mergeable: 'MERGEABLE',
  mergeStateStatus: 'CLEAN',
  body: 'Summary of the change.',
  comments: commentPage(),
  reviewThreads: {
    nodes: [{ isResolved: true, comments: commentPage() }],
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
          checkSuites,
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
// The PR's heads, each with the times its GitHub Actions check suites began.
export const pushes = (...heads: [string, ...Suite[]][]) => ({
  headRefName: HEAD_BRANCH,
  pushes: {
    pageInfo: { hasPreviousPage: false },
    nodes: heads.map(([oid, ...createdAt]) => ({
      commit: { oid, checkSuites: pushedAt(...createdAt) },
    })),
  },
});
