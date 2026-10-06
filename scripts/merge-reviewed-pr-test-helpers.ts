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
// The head commit's GitHub Actions check suites, created when it was pushed.
export const pushedAt = (...createdAt: string[]) => ({
  pageInfo: { hasNextPage: false },
  nodes: createdAt.map((time) => ({ createdAt: time })),
});
export const pullRequest = (
  checkSuites = pushedAt('2026-09-22T02:00:00Z'),
) => ({
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
export const pushes = (...heads: [string, ...string[]][]) => ({
  pushes: {
    pageInfo: { hasPreviousPage: false },
    nodes: heads.map(([oid, ...createdAt]) => ({
      commit: { oid, checkSuites: pushedAt(...createdAt) },
    })),
  },
});
