import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { hunkBodies, hunksMovedOnlyByBase } from './diff-hunks';

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
// Feature merges also read the changed files (the promotion schema does not).
const featurePullRequestSchema = pullRequestSchema.extend({
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

// GitHub keeps an approval when a later push only merges the base branch and
// repoints it to the new head (changelog 2023-06-06), so a review's commit_id
// alone does not prove CodeRabbit reviewed that head. GitHub Actions creates a
// head's check suite when the head is pushed, and re-running CI keeps it, so
// the earliest suite dates the push. Suites belong to the commit, so one made
// earlier for the same commit elsewhere dates the push earlier (AGENTS.md, How
// to Check).
const headCheckSuitesSchema = z.object({
  commits: z.object({
    nodes: z.tuple([
      z.object({
        commit: z.object({
          oid: sha,
          checkSuites: z.object({
            pageInfo,
            nodes: z.array(z.object({ createdAt: z.iso.datetime() })),
          }),
        }),
      }),
    ]),
  }),
});

// The PR's recent heads, each with its GitHub Actions check suites.
const pushesSchema = z.object({
  pushes: z.object({
    pageInfo: z.object({ hasPreviousPage: z.boolean() }),
    nodes: z.array(
      z.object({
        commit: z.object({
          oid: sha,
          checkSuites: z.object({
            pageInfo: z.object({ hasNextPage: z.boolean() }),
            nodes: z.array(z.object({ createdAt: z.iso.datetime() })),
          }),
        }),
      }),
    ),
  }),
});

// The PR head when an approval was submitted: the commit whose first push is
// the latest at or before then. GitHub's repointed approval no longer names
// that head. A push landing while CodeRabbit is still reviewing would be
// mistaken for the reviewed head; GitHub carries an approval only across a push
// that adds no new changes, and the diff comparison still checks content.
export function headPushedAsOf(
  input: unknown,
  time: string,
): string | undefined {
  const parsed = pushesSchema.safeParse(input);
  if (!parsed.success || parsed.data.pushes.pageInfo.hasPreviousPage) {
    return undefined;
  }
  const limit = Date.parse(time);
  let found: { oid: string; pushed: number } | undefined;
  for (const { commit } of parsed.data.pushes.nodes) {
    if (commit.checkSuites.pageInfo.hasNextPage) return undefined;
    const created = commit.checkSuites.nodes.map((suite) =>
      Date.parse(suite.createdAt),
    );
    if (!created.length) continue;
    const pushed = Math.min(...created);
    if (pushed <= limit && (!found || pushed > found.pushed)) {
      found = { oid: commit.oid, pushed };
    }
  }
  return found?.oid;
}

export function headPushedAt(input: unknown, head: string): string {
  const parsed = headCheckSuitesSchema.safeParse(input);
  const commit = parsed.data?.commits.nodes[0].commit;
  const created = commit?.checkSuites.nodes.map((suite) =>
    Date.parse(suite.createdAt),
  );
  if (
    commit?.oid !== head ||
    commit.checkSuites.pageInfo.hasNextPage ||
    !created?.length
  ) {
    throw new Error(
      'GitHub Actions check suites cannot date the push of the head; refusing merge',
    );
  }
  return new Date(Math.min(...created)).toISOString();
}

export function hasSuccessfulCheckRun(nodes: CheckNodes, name: string) {
  return nodes.some(
    (check) =>
      check.__typename === 'CheckRun' &&
      check.name === name &&
      check.status === 'COMPLETED' &&
      check.conclusion === 'SUCCESS',
  );
}

// ADR-020 amendments (2026-09-28, 2026-10-05): a missing codecov/patch is
// excused only when every changed path is one coverage never measures, and
// only for a complete file list. Dependabot PRs run without secrets, so
// Codecov cannot post on them; a Codecov outage posts on nothing (DEBT-497).
// The unmeasured paths are dependency manifests, CI workflows, Markdown
// documentation and repository-tool configuration.
const UNMEASURED_FILES = new Set([
  'package.json',
  'pnpm-lock.yaml',
  '.coderabbit.yaml',
  'codecov.yml',
]);

function isUnmeasuredPath(path: string): boolean {
  return (
    UNMEASURED_FILES.has(path) ||
    path.startsWith('.github/') ||
    path.endsWith('.md')
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
    files.nodes.every((file) => isUnmeasuredPath(file.path))
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
// branch, from GitHub's compare API, for CodeRabbit's latest decisive review.
// `baseChanges` is the base branch's diff from the approved head's merge base
// to the current one, which is empty when the merge base did not move.
export type CarryEvidence = {
  reviewId: number;
  approvedHead: string;
  approved: z.infer<typeof compareFilesSchema>;
  current: z.infer<typeof compareFilesSchema>;
  baseChanges: z.infer<typeof compareFilesSchema>;
};

// CodeRabbit's path filters exclude the lockfile, so it is the one file that
// may differ between the reviewed head and the current one.
const CODERABBIT_UNREVIEWED_PATH = 'pnpm-lock.yaml';

// A file's hunks may move only by the base's own edits to that file; the
// base's change must be a modification whose patch GitHub shows.
function hunksMoveWithBase(
  baseChanges: z.infer<typeof compareFilesSchema>,
  path: string,
  approved: string,
  current: string,
) {
  const change = baseChanges.find(
    (file) => file.filename === path || file.previous_filename === path,
  );
  if (change === undefined) return hunksMovedOnlyByBase(approved, current, '');
  return (
    change.status === 'modified' &&
    change.patch !== undefined &&
    hunksMovedOnlyByBase(approved, current, change.patch)
  );
}

function reviewableDiffIsIdentical(evidence: CarryEvidence) {
  const approved = compareFilesSchema.parse(evidence.approved);
  const current = compareFilesSchema.parse(evidence.current);
  const baseChanges = compareFilesSchema.parse(evidence.baseChanges);
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
        other?.patch !== undefined &&
        other.filename === file.filename &&
        other.previous_filename === file.previous_filename &&
        other.status === file.status &&
        hunkBodies(other.patch) === hunkBodies(file.patch) &&
        hunksMoveWithBase(
          baseChanges,
          file.previous_filename ?? file.filename,
          file.patch,
          other.patch,
        )
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

// An approval carries to a later head only when it is CodeRabbit's latest
// decisive review and the diff CodeRabbit reviews (every file but the lockfile
// its path filters exclude) is the same at both heads, its hunks moved only by
// the base's own edits. CodeRabbit has then reviewed exactly the change being
// merged. Two cases need this: a Dependabot
// rebase whose only new change is the lockfile, which CodeRabbit skips, and a
// push that only merges dev or main into the branch, after which GitHub
// repoints the approval itself to the new head (changelog 2023-06-06).
export function carriedApproval(
  reviewPages: unknown,
  head: string,
  evidence: CarryEvidence,
) {
  const reviews = reviewPagesSchema.safeParse(reviewPages);
  if (!reviews.success) throw new Error('Invalid GitHub review response');
  const latest = latestDecisiveCodeRabbitReview(reviews.data);
  if (
    latest?.state !== 'APPROVED' ||
    !latest.submitted_at ||
    latest.id !== evidence.reviewId ||
    evidence.approvedHead === head ||
    (latest.commit_id !== head && latest.commit_id !== evidence.approvedHead)
  ) {
    throw new Error('Missing current exact-head CodeRabbit approval');
  }
  if (!reviewableDiffIsIdentical(evidence)) {
    throw new Error(
      `The reviewable diff changed since the approved head ${evidence.approvedHead}`,
    );
  }
  return {
    id: latest.id,
    submitted_at: latest.submitted_at,
    carriedFrom: evidence.approvedHead,
  };
}

export function checkFeatureMerge(
  input: unknown,
  reviewPages: unknown,
  carry?: CarryEvidence,
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
  const approval = currentApproval(
    reviewPages,
    pr.headRefOid,
    headPushedAt(input, pr.headRefOid),
    carry,
  );
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

// DEBT-515: CodeRabbit turns a chat reply into a learning that it applies to
// every later review, and agents comment as the owner, so an agent's argument
// can change the reviewer without review. Each CodeRabbit reply that records
// one must be linked from the PR description, by URL or anchor, so the owner
// can see it and keep or delete it. Replies that only cite learnings already
// held say "Learnings used" and are not new.
const LEARNING_RECORDED = /<summary>[^<]*Learnings added<\/summary>/;
const commentPageSchema = z.object({
  pageInfo,
  nodes: z.array(
    z.object({
      author: z.object({ login: z.string() }).nullable(),
      url: z.string(),
      body: z.string(),
    }),
  ),
});
const learningCommentsSchema = z.object({
  body: z.string(),
  comments: commentPageSchema,
  reviewThreads: z.object({
    nodes: z.array(z.object({ comments: commentPageSchema })),
  }),
});

export function linkedLearningReplies(input: unknown): string[] {
  const parsed = learningCommentsSchema.safeParse(input);
  if (!parsed.success) throw new Error('Invalid GitHub comment response');
  const pr = parsed.data;
  const pages = [
    pr.comments,
    ...pr.reviewThreads.nodes.map((thread) => thread.comments),
  ];
  if (pages.some((page) => page.pageInfo.hasNextPage)) {
    throw new Error('Incomplete GitHub comments; refusing merge');
  }
  const replies = pages
    .flatMap((page) => page.nodes)
    .filter(
      (comment) =>
        comment.author?.login === 'coderabbitai' &&
        LEARNING_RECORDED.test(comment.body),
    )
    .map((comment) => comment.url);
  // An anchor must not continue with a digit, so issuecomment-12 is not
  // linked by issuecomment-123.
  const unlinked = replies.filter((url) => {
    const anchor = url.slice(url.indexOf('#') + 1);
    const escaped = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return !new RegExp(`${escaped}(?!\\d)`).test(pr.body);
  });
  if (unlinked.length > 0) {
    throw new Error(
      `CodeRabbit recorded a learning the PR description does not link: ${unlinked.join(', ')}. Link each reply from the description so the owner can keep or delete it (AGENTS.md, CodeRabbit Learnings)`,
    );
  }
  return replies;
}

// DEBT-491: every promotion adds a merge commit that only main has. dev must
// keep containing main, or the next promotion cannot be verified, so a merge
// into dev needs main in the PR head or already in dev.
export function checkCarriesMain(ancestry: {
  main: string;
  headContainsMain: boolean;
  devContainsMain?: boolean;
}): 'head' | 'dev' {
  if (ancestry.headContainsMain) return 'head';
  if (ancestry.devContainsMain) return 'dev';
  throw new Error(
    `Merging would leave dev without main's latest promotion (${ancestry.main.slice(0, 8)}): base the branch on origin/main, or merge origin/main into it`,
  );
}

export function exactHeadApproval(
  reviewPages: unknown,
  head: string,
  pushedAt: string,
) {
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
  if (Date.parse(approval.submitted_at) < Date.parse(pushedAt)) {
    throw new Error(
      'The CodeRabbit approval predates the push of the head, so GitHub carried it forward from an earlier head. Dismiss it and request `@coderabbitai full review` (AGENTS.md, The Rule, item 7)',
    );
  }
  return { id: approval.id, submitted_at: approval.submitted_at };
}

// The exact-head approval, or else a carried one. A failed carry reports why
// the exact-head approval is missing, which names the refresh to request, with
// the carry's own failure as the cause.
export function currentApproval(
  reviewPages: unknown,
  head: string,
  pushedAt: string,
  carry?: CarryEvidence,
): { id: number; submitted_at: string; carriedFrom?: string } {
  try {
    return exactHeadApproval(reviewPages, head, pushedAt);
  } catch (error) {
    if (carry === undefined) throw error;
    try {
      return carriedApproval(reviewPages, head, carry);
    } catch (carryError) {
      throw new Error(error instanceof Error ? error.message : String(error), {
        cause: carryError,
      });
    }
  }
}

const query = `query($number:Int!) {
  repository(owner:"The-Obstacle-Is-The-Way",name:"naltrexone-university") {
    pullRequest(number:$number) {
      number state isDraft baseRefName headRefOid mergeable mergeStateStatus
      baseRefOid headRefName headRepository { nameWithOwner }
      mergeCommit { oid } mergedAt body
      comments(first:100) {
        pageInfo { hasNextPage } nodes { author { login } url body }
      }
      reviewThreads(first:100) {
        nodes { isResolved comments(first:100) {
          pageInfo { hasNextPage } nodes { author { login } url body }
        } }
        pageInfo { hasNextPage }
      }
      files(first:100) { nodes { path } pageInfo { hasNextPage } }
      pushes: commits(last:100) {
        pageInfo { hasPreviousPage }
        nodes { commit { oid
          checkSuites(first:20, filterBy:{appId:15368}) {
            pageInfo { hasNextPage } nodes { createdAt }
          }
        } }
      }
      commits(last:1) { nodes { commit { oid
        checkSuites(first:20, filterBy:{appId:15368}) {
          pageInfo { hasNextPage } nodes { createdAt }
        }
        statusCheckRollup {
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

// A compare that may be truncated proves nothing about the diff, so it yields
// no carry evidence and the missing exact-head approval stands.
function readCompare(base: string, head: string) {
  const compare = z
    .object({
      merge_base_commit: z.object({ sha }),
      files: compareFilesSchema,
    })
    .parse(
      JSON.parse(gh(['api', `repos/${REPOSITORY}/compare/${base}...${head}`])),
    );
  if (compare.files.length >= COMPARE_FILE_LIMIT) return undefined;
  return { mergeBase: compare.merge_base_commit.sha, files: compare.files };
}

// behind_by counts the base's commits that the head lacks.
const compareWithMainSchema = z.object({
  behind_by: z.number().int().nonnegative(),
  base_commit: z.object({ sha: z.string().regex(/^[0-9a-f]{40}$/) }),
});

function compareWithMain(base: string, head: string) {
  return compareWithMainSchema.parse(
    JSON.parse(gh(['api', `repos/${REPOSITORY}/compare/${base}...${head}`])),
  );
}

// Whether main's head is in the PR head; if not, whether dev, compared with
// the same main commit, already has it.
export function readMainAncestry(head: string) {
  const withHead = compareWithMain('main', head);
  const main = withHead.base_commit.sha;
  if (withHead.behind_by === 0) return { main, headContainsMain: true };
  return {
    main,
    headContainsMain: false,
    devContainsMain: compareWithMain(main, 'dev').behind_by === 0,
  };
}

// Evidence for carrying CodeRabbit's latest approval to the current head. The
// approved head is the review's own commit, or, when GitHub has repointed the
// approval to the current head, the head as of the approval. Both diffs are
// taken against `base`: the PR's base branch for an open PR, or the merge's
// first parent for a merged one, whose head the base branch already contains.
export function readCarryEvidence(
  pullRequest: unknown,
  reviewPages: unknown,
  base?: string,
): CarryEvidence | undefined {
  const parsed = z
    .object({ baseRefName: z.string(), headRefOid: sha })
    .safeParse(pullRequest);
  const reviews = reviewPagesSchema.safeParse(reviewPages);
  if (!parsed.success || !reviews.success) return undefined;
  const latest = latestDecisiveCodeRabbitReview(reviews.data);
  if (latest?.state !== 'APPROVED' || !latest.submitted_at) return undefined;
  const head = parsed.data.headRefOid;
  const approvedHead =
    latest.commit_id === head
      ? headPushedAsOf(pullRequest, latest.submitted_at)
      : latest.commit_id;
  if (!approvedHead || approvedHead === head) return undefined;
  const compareBase = base ?? parsed.data.baseRefName;
  const approved = readCompare(compareBase, approvedHead);
  const current = approved && readCompare(compareBase, head);
  if (!approved || !current) return undefined;
  let baseChanges: CarryEvidence['baseChanges'] = [];
  if (approved.mergeBase !== current.mergeBase) {
    // The base branch only moves forward, so the approved head's merge base
    // must be an ancestor of the current one.
    const moved = readCompare(approved.mergeBase, current.mergeBase);
    if (moved?.mergeBase !== approved.mergeBase) return undefined;
    baseChanges = moved.files;
  }
  return {
    reviewId: latest.id,
    approvedHead,
    approved: approved.files,
    current: current.files,
    baseChanges,
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
    readCarryEvidence(evidence.pullRequest, evidence.reviewPages),
  );
  if (receipt.number !== Number(number))
    throw new Error('PR number changed during verification');
  const learnings = linkedLearningReplies(evidence.pullRequest);
  const verified = {
    ...receipt,
    ...(learnings.length > 0 ? { learnings } : {}),
    carriesMain: checkCarriesMain(readMainAncestry(receipt.head)),
  };
  write(JSON.stringify(verified));
  if (args[1] === '--merge') {
    // AGENTS.md keeps this receipt with the PR; posting it first puts it on
    // GitHub before the merge it justifies.
    gh(
      ['pr', 'comment', number, '--repo', REPOSITORY, '--body-file', '-'],
      `Reviewed-merge receipt (\`scripts/merge-reviewed-pr.ts ${number} --merge\`), verified before merging:\n\n\`\`\`json\n${JSON.stringify(verified)}\n\`\`\`\n`,
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
        verified.head,
      ]),
    );
  }
  return verified;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runMergeReviewedPr(process.argv.slice(2));
}
