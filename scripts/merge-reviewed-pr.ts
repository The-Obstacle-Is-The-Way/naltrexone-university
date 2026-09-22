import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

export const REPOSITORY = 'The-Obstacle-Is-The-Way/naltrexone-university';
const sha = z.string().regex(/^[a-f0-9]{40}$/);
const pageInfo = z.object({ hasNextPage: z.boolean() });
const checks = z.object({
  pageInfo,
  nodes: z.array(
    z.discriminatedUnion('__typename', [
      z.object({
        __typename: z.literal('CheckRun'),
        name: z.string(),
        status: z.string(),
        conclusion: z.string().nullable(),
      }),
      z.object({
        __typename: z.literal('StatusContext'),
        context: z.string(),
        state: z.string(),
      }),
    ]),
  ),
});
export const pullRequestSchema = z.object({
  number: z.number().int().positive(),
  state: z.string(),
  isDraft: z.boolean(),
  baseRefName: z.string(),
  headRefOid: sha,
  mergeable: z.string(),
  mergeStateStatus: z.string(),
  reviewThreads: z.object({
    pageInfo,
    nodes: z.array(z.object({ isResolved: z.boolean() })),
  }),
  commits: z.object({
    nodes: z.tuple([
      z.object({
        commit: z.object({
          oid: sha,
          statusCheckRollup: z.object({ contexts: checks }),
        }),
      }),
    ]),
  }),
});
const reviewPagesSchema = z.array(
  z.array(
    z.object({
      id: z.number().int().positive(),
      user: z.object({ login: z.string() }).nullable(),
      state: z.string(),
      commit_id: sha,
      submitted_at: z.iso.datetime().nullable(),
    }),
  ),
);

export function checkFeatureMerge(input: unknown, reviewPages: unknown) {
  const parsed = pullRequestSchema.safeParse(input);
  if (!parsed.success) throw new Error('Invalid GitHub merge response');
  const pr = parsed.data;
  if (
    pr.state !== 'OPEN' ||
    pr.isDraft ||
    pr.baseRefName !== 'dev' ||
    pr.mergeable !== 'MERGEABLE' ||
    pr.mergeStateStatus !== 'CLEAN'
  ) {
    throw new Error('Expected an open, ready, clean PR into dev');
  }
  const commit = pr.commits.nodes[0].commit;
  if (commit.oid !== pr.headRefOid)
    throw new Error('Check head differs from PR head');
  const contexts = commit.statusCheckRollup.contexts;
  if (contexts.pageInfo.hasNextPage || pr.reviewThreads.pageInfo.hasNextPage) {
    throw new Error('Incomplete GitHub checks or threads; refusing merge');
  }
  if (pr.reviewThreads.nodes.some((thread) => !thread.isResolved)) {
    throw new Error('PR has unresolved review threads');
  }
  const approval = exactHeadApproval(reviewPages, pr.headRefOid);
  if (
    !contexts.nodes.some(
      (check) =>
        check.__typename === 'CheckRun' &&
        check.name === 'test' &&
        check.status === 'COMPLETED' &&
        check.conclusion === 'SUCCESS',
    )
  ) {
    throw new Error('CI test has not succeeded on the exact head');
  }
  if (
    contexts.nodes.some((check) =>
      check.__typename === 'CheckRun'
        ? check.status !== 'COMPLETED' ||
          !['SUCCESS', 'SKIPPED', 'NEUTRAL'].includes(check.conclusion ?? '')
        : check.state !== 'SUCCESS',
    )
  )
    throw new Error('PR checks are not all green');
  return {
    number: pr.number,
    head: pr.headRefOid,
    approvalId: approval.id,
    approvedAt: approval.submitted_at,
    unresolvedThreads: 0,
  };
}

export function exactHeadApproval(reviewPages: unknown, head: string) {
  const reviews = reviewPagesSchema.safeParse(reviewPages);
  if (!reviews.success) throw new Error('Invalid GitHub review response');
  const approval = reviews.data
    .flat()
    .filter(
      (entry) =>
        entry.user?.login === 'coderabbitai[bot]' &&
        entry.commit_id === head &&
        ['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(entry.state),
    )
    .at(-1);
  if (approval?.state !== 'APPROVED' || !approval.submitted_at) {
    throw new Error('Missing current exact-head CodeRabbit approval');
  }
  return { id: approval.id, submitted_at: approval.submitted_at };
}

const query = `query($number:Int!) {
  repository(owner:"The-Obstacle-Is-The-Way",name:"naltrexone-university") {
    pullRequest(number:$number) {
      number state isDraft baseRefName headRefOid mergeable mergeStateStatus
      baseRefOid headRefName headRepository { nameWithOwner }
      mergeCommit { oid } mergedAt
      reviewThreads(first:100) { nodes { isResolved } pageInfo { hasNextPage } }
      commits(last:1) { nodes { commit { oid statusCheckRollup {
        contexts(first:100) {
          pageInfo { hasNextPage }
          nodes { __typename
            ... on CheckRun { name status conclusion }
            ... on StatusContext { context state }
          }
        }
      } } } }
    }
  }
}`;

function gh(args: string[]): string {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 32 * 1024 * 1024,
  });
}

export function readMergeEvidence(number: string) {
  const response = z
    .object({
      data: z.object({ repository: z.object({ pullRequest: z.unknown() }) }),
    })
    .parse(
      JSON.parse(
        gh([
          'api',
          'graphql',
          '-f',
          `query=${query}`,
          '-F',
          `number=${number}`,
        ]),
      ),
    );
  const reviewPages: unknown = JSON.parse(
    gh([
      'api',
      '--paginate',
      '--slurp',
      `repos/${REPOSITORY}/pulls/${number}/reviews?per_page=100`,
    ]),
  );
  return { pullRequest: response.data.repository.pullRequest, reviewPages };
}

export function runMergeReviewedPr(
  args: string[],
  write: (value: string) => void = console.log,
) {
  const number = args[0];
  if (
    !number ||
    !/^[1-9]\d*$/.test(number) ||
    !Number.isSafeInteger(Number(number)) ||
    args.length > 2 ||
    (args[1] !== undefined && args[1] !== '--merge')
  ) {
    throw new Error(
      'Usage: tsx scripts/merge-reviewed-pr.ts PR_NUMBER [--merge]',
    );
  }
  const evidence = readMergeEvidence(number);
  const receipt = checkFeatureMerge(evidence.pullRequest, evidence.reviewPages);
  if (receipt.number !== Number(number))
    throw new Error('PR number changed during verification');
  write(JSON.stringify(receipt));
  if (args[1] === '--merge') {
    write(
      gh([
        'pr',
        'merge',
        number,
        '--repo',
        REPOSITORY,
        '--merge',
        '--match-head-commit',
        receipt.head,
      ]),
    );
  }
  return receipt;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runMergeReviewedPr(process.argv.slice(2));
}
