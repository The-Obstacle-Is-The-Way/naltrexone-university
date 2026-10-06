import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import {
  type CarryEvidence,
  currentApproval,
  hasSuccessfulCheckRun,
  headPushedAt,
  pullRequestSchema,
  REPOSITORY,
  readCarryEvidence,
  readMergeEvidence,
} from './merge-reviewed-pr';

const RECEIPT_START = '<!-- verify-promotion:start -->';
const RECEIPT_END = '<!-- verify-promotion:end -->';

// The receipt between the markers, or null when the body has none. Anything
// but exactly one well-ordered pair of markers fails closed.
export function readPromotionReceipt(body: string): string | null {
  const starts = body.split(RECEIPT_START).length - 1;
  const ends = body.split(RECEIPT_END).length - 1;
  if (starts === 0 && ends === 0) return null;
  const start = body.indexOf(RECEIPT_START);
  const end = body.indexOf(RECEIPT_END);
  if (starts !== 1 || ends !== 1 || end < start) {
    throw new Error('Malformed promotion receipt markers');
  }
  return body.slice(start + RECEIPT_START.length + 1, end - 1);
}

// Writes the receipt into its marked section, replacing an earlier one, so a
// refreshed proof never stacks beside a stale one.
export function withPromotionReceipt(body: string, receipt: string) {
  const section = `${RECEIPT_START}\n${receipt}\n${RECEIPT_END}`;
  if (readPromotionReceipt(body) === null) {
    return `${body.trimEnd()}\n\n${section}\n`;
  }
  const start = body.indexOf(RECEIPT_START);
  const end = body.indexOf(RECEIPT_END) + RECEIPT_END.length;
  return `${body.slice(0, start)}${section}${body.slice(end)}`;
}

export function runVerifyPromotion(
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
      'Usage: tsx scripts/verify-promotion.ts PR_NUMBER [--merge]',
    );
  }
  const merge = args[1] === '--merge';
  const run = (file: string, command: string[], input?: string) =>
    execFileSync(file, command, {
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 32 * 1024 * 1024,
      input,
    });
  // Without --merge, fetch origin before invoking this command; missing local
  // objects fail closed. --merge fetches first itself.
  if (merge) run('git', ['fetch', '--quiet', 'origin']);
  const evidence = readMergeEvidence(number);
  const pr = checkPromotionReadiness(evidence.pullRequest);
  if (pr.number !== Number(number)) throw new Error('Promotion number changed');
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
      // The source PR's diff is taken against the merge's first parent, dev
      // just before the merge; dev now contains the PR and shows no diff.
      readCarryEvidence(source.pullRequest, source.reviewPages, commit.base),
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
        `| #${source.number} | ${source.merge} | ${source.carriedFrom ? `${source.head} (carried from ${source.carriedFrom})` : source.head} | ${source.approvalId} | ${source.approvedAt} < ${source.mergedAt} |`,
    ),
    '',
    'All source PRs target dev and currently have zero unresolved threads. Their CodeRabbit approvals predate their merges and cover the merged head: exactly, or carried from an approved head whose reviewable diff is unchanged. Thread state is a current API observation, not a reconstructed historical snapshot; the enforced thread-resolution rule and source merge receipts cover the merge-time obligation.',
    '',
    'Promotion CI test is successful and posted threads are resolved. Its own CodeRabbit approval is not required. Refresh this proof if either branch moves; merge only the verified head with --match-head-commit.',
  ].join('\n');
  write(receipt);
  if (merge) {
    // AGENTS.md step 1 before step 4: the body shows the proof before the
    // merge, so GitHub alone can show the order.
    const readBody = () =>
      run('gh', [
        'pr',
        'view',
        number,
        '--repo',
        REPOSITORY,
        '--json',
        'body',
        '--jq',
        '.body',
      ]);
    run(
      'gh',
      ['pr', 'edit', number, '--repo', REPOSITORY, '--body-file', '-'],
      withPromotionReceipt(readBody(), receipt),
    );
    if (readPromotionReceipt(readBody()) !== receipt) {
      throw new Error(
        'Promotion body does not show the receipt; refusing to merge',
      );
    }
    // --match-head-commit pins only the head, and GitHub offers no way to pin
    // the base at merge time. This re-read is the last observation before the
    // merge: a base that moved since the proof is refused here, so the
    // receipt's base is current as of this read (#1138 and #1139 reviews).
    const latest = checkPromotionReadiness(
      readMergeEvidence(number).pullRequest,
    );
    if (
      latest.baseRefOid !== pr.baseRefOid ||
      latest.headRefOid !== pr.headRefOid
    ) {
      throw new Error('Promotion base or head changed; refusing to merge');
    }
    write(
      run('gh', [
        'pr',
        'merge',
        number,
        '--repo',
        REPOSITORY,
        '--merge',
        '--match-head-commit',
        pr.headRefOid,
      ]),
    );
  }
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
  if (!hasSuccessfulCheckRun(contexts.nodes, 'test')) {
    throw new Error('Promotion CI test has not succeeded');
  }
  if (!hasSuccessfulCheckRun(contexts.nodes, 'codecov/patch')) {
    throw new Error('Promotion codecov/patch has not succeeded');
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
      const [merge, base, head] = z
        .tuple([sha, sha, sha])
        .parse(line.trim().split(/\s+/));
      return { merge, base, head };
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
  carry?: CarryEvidence,
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
  const approval = currentApproval(
    reviews,
    commit.head,
    headPushedAt(input, commit.head),
    carry,
  );
  if (Date.parse(approval.submitted_at) >= Date.parse(pr.mergedAt)) {
    throw new Error('Source approval must exist before the source merge');
  }
  return {
    number: pr.number,
    merge: commit.merge,
    head: commit.head,
    carriedFrom: approval.carriedFrom,
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
