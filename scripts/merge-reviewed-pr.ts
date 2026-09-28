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
// Feature merges also read the author and changed files (the promotion schema
// does not).
const featurePullRequestSchema = pullRequestSchema.extend({
  author: z.object({ login: z.string() }).nullable(),
  files: z.object({
    pageInfo,
    nodes: z.array(z.object({ path: z.string() })),
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

type CheckNodes = z.infer<typeof checks>['nodes'];

export function hasSuccessfulCheckRun(nodes: CheckNodes, name: string) {
  return nodes.some(
    (check) =>
      check.__typename === 'CheckRun' &&
      check.name === name &&
      check.status === 'COMPLETED' &&
      check.conclusion === 'SUCCESS',
  );
}

// ADR-020 amendment (2026-09-28): Dependabot PRs run without secrets, so
// Codecov cannot post codecov/patch on them, and a change confined to
// dependency manifests or CI workflows has no line coverage measures. Only a
// missing status is excused, only for a complete file list, and only when
// every changed path is one of these.
function isDependencyOrWorkflowPath(path: string): boolean {
  return (
    path === 'package.json' ||
    path === 'pnpm-lock.yaml' ||
    path.startsWith('.github/')
  );
}

function codecovNotApplicable(
  files: z.infer<typeof featurePullRequestSchema>['files'],
  nodes: CheckNodes,
): boolean {
  const codecovPosted = nodes.some(
    (check) =>
      check.__typename === 'CheckRun' && check.name === 'codecov/patch',
  );
  return (
    !codecovPosted &&
    !files.pageInfo.hasNextPage &&
    files.nodes.length > 0 &&
    files.nodes.every((file) => isDependencyOrWorkflowPath(file.path))
  );
}

const compareFilesSchema = z.array(
  z.object({
    filename: z.string(),
    previous_filename: z.string().optional(),
    status: z.string(),
    patch: z.string().optional(),
  }),
);

// A PR's own diff at two heads, each against its merge base with the PR's base
// branch, from GitHub's compare API.
export type DependabotCarryEvidence = {
  approvedHead: string;
  approved: z.infer<typeof compareFilesSchema>;
  current: z.infer<typeof compareFilesSchema>;
};

// CodeRabbit's path filters exclude the lockfile, so it is the one file that
// may differ between the reviewed head and the current one.
const CODERABBIT_UNREVIEWED_PATH = 'pnpm-lock.yaml';

function isDependabot(author: { login: string } | null): boolean {
  return author?.login === 'dependabot' || author?.login === 'dependabot[bot]';
}

function reviewableDiffIsIdentical(evidence: DependabotCarryEvidence) {
  const approved = compareFilesSchema.parse(evidence.approved);
  const current = compareFilesSchema.parse(evidence.current);
  // Only the lockfile's own diff is skipped; a rename onto its path would
  // hide the removal of the renamed file.
  const reviewable = (files: typeof approved) =>
    files
      .filter(
        (file) =>
          file.filename !== CODERABBIT_UNREVIEWED_PATH ||
          file.previous_filename !== undefined,
      )
      .sort((a, b) => a.filename.localeCompare(b.filename));
  const before = reviewable(approved);
  const after = reviewable(current);
  return (
    before.length === after.length &&
    before.every((file, index) => {
      const other = after[index];
      return (
        file.patch !== undefined &&
        other !== undefined &&
        other.filename === file.filename &&
        other.previous_filename === file.previous_filename &&
        other.status === file.status &&
        other.patch === file.patch
      );
    })
  );
}

// CodeRabbit's latest approval, change request or dismissal, on any head.
function latestDecisiveCodeRabbitReview(
  pages: z.infer<typeof reviewPagesSchema>,
) {
  return pages
    .flat()
    .filter(
      (entry) =>
        entry.user?.login === 'coderabbitai[bot]' &&
        ['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(entry.state),
    )
    .at(-1);
}

// Dependabot PRs: CodeRabbit reviews once, when the PR opens, and skips a
// rebase whose only new change is the lockfile. Its approval carries to the
// current head only when it is CodeRabbit's latest decisive review and every
// other file's diff is byte-identical at both heads.
function carriedDependabotApproval(
  author: { login: string } | null,
  reviewPages: unknown,
  head: string,
  evidence: DependabotCarryEvidence | undefined,
) {
  const reviews = reviewPagesSchema.safeParse(reviewPages);
  if (!reviews.success) throw new Error('Invalid GitHub review response');
  const latest = latestDecisiveCodeRabbitReview(reviews.data);
  if (
    !isDependabot(author) ||
    !evidence ||
    latest?.state !== 'APPROVED' ||
    !latest.submitted_at ||
    latest.commit_id === head ||
    evidence.approvedHead !== latest.commit_id ||
    !reviewableDiffIsIdentical(evidence)
  ) {
    throw new Error('Missing current exact-head CodeRabbit approval');
  }
  return {
    id: latest.id,
    submitted_at: latest.submitted_at,
    carriedFrom: latest.commit_id,
  };
}

export function latestCodeRabbitApprovalHead(
  reviewPages: unknown,
): string | null {
  const reviews = reviewPagesSchema.safeParse(reviewPages);
  if (!reviews.success) return null;
  const latest = latestDecisiveCodeRabbitReview(reviews.data);
  return latest?.state === 'APPROVED' ? latest.commit_id : null;
}

export function checkFeatureMerge(
  input: unknown,
  reviewPages: unknown,
  carry?: DependabotCarryEvidence,
) {
  const parsed = featurePullRequestSchema.safeParse(input);
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
  let approval: { id: number; submitted_at: string; carriedFrom?: string };
  try {
    approval = exactHeadApproval(reviewPages, pr.headRefOid);
  } catch (error) {
    if (carry === undefined) throw error;
    approval = carriedDependabotApproval(
      pr.author,
      reviewPages,
      pr.headRefOid,
      carry,
    );
  }
  if (!hasSuccessfulCheckRun(contexts.nodes, 'test')) {
    throw new Error('CI test has not succeeded on the exact head');
  }
  // ADR-020: patch coverage is the one coverage gate, and CI's upload is
  // non-blocking, so a missing status must block like a red one.
  if (
    !hasSuccessfulCheckRun(contexts.nodes, 'codecov/patch') &&
    !codecovNotApplicable(pr.files, contexts.nodes)
  ) {
    throw new Error('codecov/patch has not succeeded on the exact head');
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
    ...(approval.carriedFrom ? { carriedFrom: approval.carriedFrom } : {}),
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
      author { login }
      reviewThreads(first:100) { nodes { isResolved } pageInfo { hasNextPage } }
      files(first:100) { nodes { path } pageInfo { hasNextPage } }
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

function gh(args: string[], input?: string): string {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 32 * 1024 * 1024,
    input,
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

// GitHub's compare API lists at most 300 files; a list that long may be
// truncated, so it cannot prove two diffs identical.
const COMPARE_FILE_LIMIT = 300;

function readCompareFiles(base: string, head: string) {
  const { files } = z
    .object({ files: compareFilesSchema })
    .parse(
      JSON.parse(gh(['api', `repos/${REPOSITORY}/compare/${base}...${head}`])),
    );
  if (files.length >= COMPARE_FILE_LIMIT) {
    throw new Error('Compare response may be truncated; refusing to carry');
  }
  return files;
}

// Reads the carry evidence only for a Dependabot PR whose latest CodeRabbit
// verdict is an approval on an earlier head.
export function readDependabotCarryEvidence(
  pullRequest: unknown,
  reviewPages: unknown,
): DependabotCarryEvidence | undefined {
  const parsed = featurePullRequestSchema.safeParse(pullRequest);
  if (!parsed.success || !isDependabot(parsed.data.author)) return undefined;
  const approvedHead = latestCodeRabbitApprovalHead(reviewPages);
  if (!approvedHead || approvedHead === parsed.data.headRefOid) {
    return undefined;
  }
  const base = parsed.data.baseRefName;
  return {
    approvedHead,
    approved: readCompareFiles(base, approvedHead),
    current: readCompareFiles(base, parsed.data.headRefOid),
  };
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
  const receipt = checkFeatureMerge(
    evidence.pullRequest,
    evidence.reviewPages,
    readDependabotCarryEvidence(evidence.pullRequest, evidence.reviewPages),
  );
  if (receipt.number !== Number(number))
    throw new Error('PR number changed during verification');
  write(JSON.stringify(receipt));
  if (args[1] === '--merge') {
    // AGENTS.md keeps this receipt with the PR; posting it first puts it on
    // GitHub before the merge it justifies.
    gh(
      ['pr', 'comment', number, '--repo', REPOSITORY, '--body-file', '-'],
      `Reviewed-merge receipt (\`scripts/merge-reviewed-pr.ts ${number} --merge\`), verified before merging:\n\n\`\`\`json\n${JSON.stringify(receipt)}\n\`\`\`\n`,
    );
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
