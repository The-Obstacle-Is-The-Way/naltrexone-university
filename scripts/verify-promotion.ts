import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import {
  exactHeadApproval,
  pullRequestSchema,
  REPOSITORY,
  readMergeEvidence,
} from './merge-reviewed-pr';

export function runVerifyPromotion(
  args: string[],
  write: (value: string) => void = console.log,
) {
  const number = args[0];
  if (
    args.length !== 1 ||
    !number ||
    !/^[1-9]\d*$/.test(number) ||
    !Number.isSafeInteger(Number(number))
  ) {
    throw new Error('Usage: tsx scripts/verify-promotion.ts PR_NUMBER');
  }
  const evidence = readMergeEvidence(number);
  const pr = checkPromotionReadiness(evidence.pullRequest);
  if (pr.number !== Number(number)) throw new Error('Promotion number changed');
  const run = (file: string, command: string[]) =>
    execFileSync(file, command, {
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 32 * 1024 * 1024,
    });
  // Fetch origin before invoking this command; missing local objects fail closed.
  run('git', [
    '--no-pager',
    'merge-base',
    '--is-ancestor',
    pr.baseRefOid,
    pr.headRefOid,
  ]);
  const commits = firstParentMerges(
    run('git', [
      '--no-pager',
      'rev-list',
      '--first-parent',
      '--reverse',
      '--parents',
      `${pr.baseRefOid}..${pr.headRefOid}`,
    ]),
  );
  const sources = commits.map((commit) => {
    const associations: unknown = JSON.parse(
      run('gh', [
        'api',
        '--paginate',
        '--slurp',
        `repos/${REPOSITORY}/commits/${commit.merge}/pulls?per_page=100`,
      ]),
    );
    const sourceNumber = sourcePrNumber(commit.merge, associations);
    const source = readMergeEvidence(String(sourceNumber));
    const receipt = checkSourceProvenance(
      commit,
      source.pullRequest,
      source.reviewPages,
    );
    if (receipt.number !== sourceNumber)
      throw new Error('Source PR number changed');
    return receipt;
  });
  const receipt = [
    '## Reviewed promotion provenance',
    '',
    `Promotion: #${pr.number}; Head: \`${pr.headRefOid}\`; Base: \`${pr.baseRefOid}\`.`,
    '',
    '| Source PR | Merge | Reviewed head | Approval ID | Approved before merge |',
    '| --- | --- | --- | --- | --- |',
    ...sources.map(
      (source) =>
        `| #${source.number} | ${source.merge} | ${source.head} | ${source.approvalId} | ${source.approvedAt} < ${source.mergedAt} |`,
    ),
    '',
    'All source PRs target dev and currently have zero unresolved threads. Their exact-head approvals predate their merges. Thread state is a current API observation, not a reconstructed historical snapshot; the enforced thread-resolution rule and source merge receipts cover the merge-time obligation.',
    '',
    'Promotion CI test is successful and posted threads are resolved. Its own CodeRabbit approval is not required. Refresh this proof if either branch moves; merge only the verified head with --match-head-commit.',
  ].join('\n');
  write(receipt);
  return receipt;
}

const sha = z.string().regex(/^[a-f0-9]{40}$/);
const promotionSchema = pullRequestSchema.extend({
  baseRefOid: sha,
  headRefName: z.literal('dev'),
  headRepository: z.object({ nameWithOwner: z.literal(REPOSITORY) }),
});

export function checkPromotionReadiness(input: unknown) {
  const pr = promotionSchema.parse(input);
  if (
    pr.state !== 'OPEN' ||
    pr.isDraft ||
    pr.baseRefName !== 'main' ||
    pr.mergeable !== 'MERGEABLE' ||
    !['CLEAN', 'UNSTABLE'].includes(pr.mergeStateStatus)
  ) {
    throw new Error('Expected an open, ready, unblocked dev-to-main promotion');
  }
  const commit = pr.commits.nodes[0].commit;
  const contexts = commit.statusCheckRollup.contexts;
  if (
    commit.oid !== pr.headRefOid ||
    contexts.pageInfo.hasNextPage ||
    pr.reviewThreads.pageInfo.hasNextPage
  ) {
    throw new Error('Incomplete or wrong-head promotion evidence');
  }
  if (pr.reviewThreads.nodes.some((thread) => !thread.isResolved)) {
    throw new Error('Promotion has unresolved review findings');
  }
  if (
    !contexts.nodes.some(
      (check) =>
        check.__typename === 'CheckRun' &&
        check.name === 'test' &&
        check.status === 'COMPLETED' &&
        check.conclusion === 'SUCCESS',
    )
  ) {
    throw new Error('Promotion CI test has not succeeded');
  }
  if (
    contexts.nodes.some((check) => {
      const name = check.__typename === 'CheckRun' ? check.name : check.context;
      if (name === 'CodeRabbit') return false;
      return check.__typename === 'CheckRun'
        ? check.status !== 'COMPLETED' ||
            !['SUCCESS', 'SKIPPED', 'NEUTRAL'].includes(check.conclusion ?? '')
        : check.state !== 'SUCCESS';
    })
  )
    throw new Error('Other promotion checks are not green');
  return pr;
}

export function firstParentMerges(input: string) {
  if (!input.trim()) throw new Error('No first-parent merges to promote');
  return input
    .trim()
    .split('\n')
    .map((line) => {
      const [merge, , head] = z
        .tuple([sha, sha, sha])
        .parse(line.trim().split(/\s+/));
      return { merge, head };
    });
}

export function sourcePrNumber(merge: string, pages: unknown) {
  const matches = z
    .array(
      z.array(
        z.object({
          number: z.number().int().positive(),
          merge_commit_sha: sha.nullable(),
        }),
      ),
    )
    .parse(pages)
    .flat()
    .filter((pr) => pr.merge_commit_sha === merge);
  if (matches.length !== 1 || !matches[0])
    throw new Error('Missing or ambiguous source PR');
  return matches[0].number;
}

const sourceSchema = z.object({
  number: z.number().int().positive(),
  state: z.literal('MERGED'),
  baseRefName: z.literal('dev'),
  headRefOid: sha,
  mergeCommit: z.object({ oid: sha }),
  mergedAt: z.iso.datetime(),
  reviewThreads: z.object({
    nodes: z.array(z.object({ isResolved: z.boolean() })),
    pageInfo: z.object({ hasNextPage: z.literal(false) }),
  }),
});

export function checkSourceProvenance(
  commit: { merge: string; head: string },
  input: unknown,
  reviews: unknown,
) {
  const pr = sourceSchema.parse(input);
  if (pr.mergeCommit.oid !== commit.merge || pr.headRefOid !== commit.head) {
    throw new Error(
      'Source PR does not match the actual merge and second-parent head',
    );
  }
  if (pr.reviewThreads.nodes.some((thread) => !thread.isResolved)) {
    throw new Error('Source PR has unresolved findings');
  }
  const approval = exactHeadApproval(reviews, commit.head);
  if (Date.parse(approval.submitted_at) >= Date.parse(pr.mergedAt)) {
    throw new Error('Source approval must exist before the source merge');
  }
  return {
    number: pr.number,
    ...commit,
    approvalId: approval.id,
    approvedAt: approval.submitted_at,
    mergedAt: pr.mergedAt,
    unresolvedThreadsNow: 0,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runVerifyPromotion(process.argv.slice(2));
}
