import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { LEARNING_RECORDED, recordedLearnings } from './coderabbit-learnings';
import {
  type AlertIssueSync,
  type AlertIssues,
  createGithubAlertIssues,
  syncAlertIssue,
} from './github-alert-issues';

// DEBT-515: CodeRabbit records about eight learnings a day from replies that
// agents post as the owner, and applies each to every later review.
// `.coderabbit.yaml` holds a new one for HOLD_DAYS, but one nobody rejects
// applies when the hold ends, and CodeRabbit sends no notice. This weekly job
// keeps one GitHub issue listing the past week's learnings, which notifies the
// owner. Learnings that tell CodeRabbit to stop raising something come first,
// because those are the ones that can let a defect through.
const HOLD_DAYS = 30;
// A week, plus a day so that a delayed scheduled run misses nothing.
const LOOKBACK_DAYS = 8;
export const LEARNINGS_REVIEW_ISSUE_TITLE =
  'CodeRabbit learnings recorded this week';
const DAY_MS = 24 * 60 * 60 * 1000;
// GitHub rejects an issue body over 65,536 characters.
const BODY_LIMIT = 60_000;

// Wording that tells a reviewer not to raise something: "do not require…",
// "is acceptable", "the owner accepts…", "not a prerequisite". A heuristic for
// ordering the list, not a verdict; every learning is still listed.
const SUPPRESSES =
  /\b(?:do not|don't|must not|should not|need not|never)\b[^.]{0,80}?\b(?:recommend|require|flag|request|treat|raise|suggest|report|infer|add|expect|ask)|\b(?:acceptable|intentionally|by design)\b|\bexplicitly accepts?\b|\bowner (?:accepts|confirmed|decided|ruled|approved)\b|\bnot an? (?:bug|defect|prerequisite|regression|issue)\b/i;

export function suppressesFindings(learning: string): boolean {
  return SUPPRESSES.test(learning);
}

const commentPagesSchema = z.array(
  z.array(
    z.object({
      html_url: z.string(),
      created_at: z.iso.datetime(),
      body: z.string().nullable(),
      user: z.object({ login: z.string() }).nullable(),
    }),
  ),
);

export type LearningReply = {
  url: string;
  pullRequest: number;
  recordedAt: string;
  appliesOn: string;
  learnings: { text: string; suppresses: boolean }[];
};

const day = (time: number) => new Date(time).toISOString().slice(0, 10);

// CodeRabbit's replies, among PR comments and review-thread replies, that
// recorded a learning in the LOOKBACK_DAYS before `now`, newest first.
export function learningReplies(
  issueComments: unknown,
  reviewComments: unknown,
  now: Date,
): LearningReply[] {
  const comments = [issueComments, reviewComments].flatMap((input) => {
    const parsed = commentPagesSchema.safeParse(input);
    if (!parsed.success) throw new Error('Invalid GitHub comment response');
    return parsed.data.flat();
  });
  const start = now.getTime() - LOOKBACK_DAYS * DAY_MS;
  return comments
    .filter(
      (comment) =>
        comment.user?.login === 'coderabbitai[bot]' &&
        LEARNING_RECORDED.test(comment.body ?? '') &&
        Date.parse(comment.created_at) >= start,
    )
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map((comment) => {
      const recorded = Date.parse(comment.created_at);
      return {
        url: comment.html_url,
        pullRequest: Number(/\/pull\/(\d+)#/.exec(comment.html_url)?.[1]),
        recordedAt: day(recorded),
        appliesOn: day(recorded + HOLD_DAYS * DAY_MS),
        learnings: recordedLearnings(comment.body ?? '').map((text) => ({
          text,
          suppresses: suppressesFindings(text),
        })),
      };
    });
}

// Entries are added in order, flagged ones first, until the body would pass
// GitHub's limit; the rest are counted, so a busy week still opens the issue.
function describeLearnings(replies: LearningReply[]): string {
  const link = (reply: LearningReply) =>
    `[#${reply.pullRequest}](${reply.url}), recorded ${reply.recordedAt}`;
  const first = replies.filter((reply) =>
    reply.learnings.some((learning) => learning.suppresses),
  );
  const rest = replies.filter((reply) => !first.includes(reply));
  const quoted = first.map(
    (reply) =>
      `- ${link(reply)}; if still pending, applies by itself ${reply.appliesOn}\n` +
      reply.learnings
        .map((learning) => `  > ${learning.text.slice(0, 600)}\n`)
        .join(''),
  );
  const listed = rest.map(
    (reply) =>
      `- ${link(reply)}: ${reply.learnings
        .map((learning) => learning.text)
        .join(' ')
        .slice(0, 240)}\n`,
  );
  const intro =
    `CodeRabbit recorded these learnings from pull-request chat in the past week. Each one applies to every later review. Agents comment as the owner, so a learning may come from an agent's argument rather than the owner's ruling. \`.coderabbit.yaml\` holds a new learning for ${HOLD_DAYS} days, then applies it unless the owner rejects it (DEBT-515).\n\n` +
    'At https://app.coderabbit.ai/learnings, reject a pending learning under **Pending approvals**, or delete an applied one, if it would let a defect through or states a decision the owner did not make.\n\n';
  const firstHeading =
    '**Review first.** These tell CodeRabbit to stop raising something:\n\n';
  const restHeading = '**Also recorded:**\n\n';
  const outro =
    'This issue is rewritten weekly and closes itself in a week with no new learning. Procedure: AGENTS.md, "CodeRabbit Learnings".\n';
  // Room for the fixed text and the line counting what is left out.
  let budget =
    BODY_LIMIT -
    intro.length -
    firstHeading.length -
    restHeading.length -
    outro.length -
    100;
  const withinBudget = (entries: string[]) =>
    entries.filter((entry) => {
      if (entry.length > budget) return false;
      budget -= entry.length;
      return true;
    });
  const shownFirst = withinBudget(quoted);
  const shownRest = withinBudget(listed);
  const omitted =
    quoted.length - shownFirst.length + listed.length - shownRest.length;
  return (
    intro +
    (shownFirst.length > 0 ? `${firstHeading}${shownFirst.join('')}\n` : '') +
    (shownRest.length > 0 ? `${restHeading}${shownRest.join('')}\n` : '') +
    (omitted > 0 ? `- …and ${omitted} more; see the Learnings list.\n\n` : '') +
    outro
  );
}

export function reportLearnings(
  replies: LearningReply[],
  issues: AlertIssues,
): Promise<AlertIssueSync> {
  return syncAlertIssue(
    issues,
    LEARNINGS_REVIEW_ISSUE_TITLE,
    replies.length > 0 ? describeLearnings(replies) : null,
    {
      resolved: 'CodeRabbit recorded no new learning this week.',
      changed: "This week's CodeRabbit learnings are in the description.",
    },
  );
}

function gh(args: string[]): string {
  // Credentials come only from the workflow's scoped GH_TOKEN; never log them.
  return execFileSync('gh', args, {
    encoding: 'utf8',
    timeout: 60_000,
    maxBuffer: 64 * 1024 * 1024,
  });
}

// GitHub's `since` filters on the last update, which is never before creation,
// so it keeps every comment created inside the window.
export function readLearningReplies(now: Date): LearningReply[] {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS).toISOString();
  const read = (endpoint: string): unknown =>
    JSON.parse(
      gh([
        'api',
        '--paginate',
        '--slurp',
        `repos/{owner}/{repo}/${endpoint}?since=${since}&per_page=100`,
      ]),
    );
  return learningReplies(read('issues/comments'), read('pulls/comments'), now);
}

// `--dry-run` reports what the job would raise without touching GitHub issues.
export async function runFromCommandLine(
  argv: readonly string[],
  output: Pick<Console, 'log' | 'error'> = console,
  now = new Date(),
): Promise<number> {
  try {
    const replies = readLearningReplies(now);
    const flagged = replies.filter((reply) =>
      reply.learnings.some((learning) => learning.suppresses),
    ).length;
    const summary = `CodeRabbit learnings recorded in the past week: ${replies.length}, ${flagged} telling it to stop raising something`;
    if (argv.includes('--dry-run')) {
      output.log(`${summary} (dry run; no issue touched)`);
      return 0;
    }
    const result = await reportLearnings(replies, createGithubAlertIssues());
    output.log(`${summary} (${result})`);
    return 0;
  } catch {
    output.error(
      'CodeRabbit learnings review failed; inspect GitHub comment and issue access.',
    );
    return 1;
  }
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
// No top-level await: tsx runs this repository's scripts as CommonJS.
/* v8 ignore start */
if (import.meta.url === executedPath) {
  void runFromCommandLine(process.argv).then((code) => {
    process.exitCode = code;
  });
}
/* v8 ignore stop */
