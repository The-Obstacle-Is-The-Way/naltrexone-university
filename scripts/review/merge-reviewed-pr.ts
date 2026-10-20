import { z } from 'zod';
import { stripPnpmSeparator } from '../lib/command-args';
import { isMain } from '../lib/entry-point.mts';
import { createGhRunner, type Gh } from '../lib/github-cli.mts';
import {
  type CarryEvidence,
  checkCarriesMain,
  checkFeatureMerge,
  compareFilesSchema,
  headPushedAsOf,
  latestDecisiveCodeRabbitReview,
  linkedLearningReplies,
  REPOSITORY,
  restoreDeletedBranchNames,
  reviewPagesSchema,
  sha,
} from './merge-policy';

// GitHub Actions' app ID: the check suites that date a push, in both APIs.
const ACTIONS_APP_ID = 15368;
// REST lists at most this many check suites per page.
const REST_SUITE_PAGE = 100;

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
          checkSuites(first:20, filterBy:{appId:${ACTIONS_APP_ID}}) {
            pageInfo { hasNextPage } nodes { createdAt branch { name } }
          }
        } }
      }
      commits(last:1) { nodes { commit { oid
        checkSuites(first:20, filterBy:{appId:${ACTIONS_APP_ID}}) {
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

const gh = createGhRunner({ timeout: 30000, maxBuffer: 32 * 1024 * 1024 });

// Bind one transport across every read and mutation, including REST fallbacks.
// Promotion reuses these readers without replacing their parsers or policies.
export function createMergeCommands(run: Gh = gh) {
  function readRestCheckSuites(oid: string): string {
    return run([
      'api',
      `repos/${REPOSITORY}/commits/${oid}/check-suites?app_id=${ACTIONS_APP_ID}&per_page=${REST_SUITE_PAGE}`,
    ]);
  }

  function readMergeEvidence(number: string) {
    const response = z
      .object({
        data: z.object({ repository: z.object({ pullRequest: z.unknown() }) }),
      })
      .parse(
        JSON.parse(
          run([
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
      run([
        'api',
        '--paginate',
        '--slurp',
        `repos/${REPOSITORY}/pulls/${number}/reviews?per_page=100`,
      ]),
    );
    return {
      pullRequest: restoreDeletedBranchNames(
        response.data.repository.pullRequest,
        readRestCheckSuites,
      ),
      reviewPages,
    };
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
        JSON.parse(
          run(['api', `repos/${REPOSITORY}/compare/${base}...${head}`]),
        ),
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
      JSON.parse(run(['api', `repos/${REPOSITORY}/compare/${base}...${head}`])),
    );
  }

  // Whether main's head is in the PR head; if not, whether dev, compared with
  // the same main commit, already has it.
  function readMainAncestry(head: string) {
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
  function readCarryEvidence(
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

  function runMergeReviewedPr(
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
        'Usage: tsx scripts/review/merge-reviewed-pr.ts PR_NUMBER [--merge]',
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
      // The receipt stays with the PR (ADR-024); posting it first puts it on
      // GitHub before the merge it justifies.
      run(
        ['pr', 'comment', number, '--repo', REPOSITORY, '--body-file', '-'],
        `Reviewed-merge receipt (\`scripts/review/merge-reviewed-pr.ts ${number} --merge\`), verified before merging:\n\n\`\`\`json\n${JSON.stringify(verified)}\n\`\`\`\n`,
      );
      write(
        run([
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

  return {
    readMergeEvidence,
    readCarryEvidence,
    readMainAncestry,
    runMergeReviewedPr,
  };
}

export const { runMergeReviewedPr } = createMergeCommands();

if (isMain(import.meta.url)) {
  runMergeReviewedPr(stripPnpmSeparator(process.argv.slice(2)));
}
