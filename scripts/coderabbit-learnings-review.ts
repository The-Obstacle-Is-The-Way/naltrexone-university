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
// keeps one GitHub issue, assigned to the owner so GitHub notifies them,
// listing every learning since the last report. Learnings that tell CodeRabbit
// to stop raising something come first, because those are the ones that can
// let a defect through.
const HOLD_DAYS = 30;
// Where a first run starts: a week, plus a day for a delayed scheduled run.
const LOOKBACK_DAYS = 8;
// The report records the newest learning it listed, so the next run starts
// after it, whatever runs were dropped in between.
const CURSOR = /<!-- coderabbit-learnings-through: (\S+) -->/;
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
  // When CodeRabbit posted the reply, as GitHub reports it.
  recorded: string;
  // The pull request or issue the reply is on.
  number: number;
  recordedAt: string;
  appliesOn: string;
  learnings: { text: string; suppresses: boolean }[];
};

const day = (time: number) => new Date(time).toISOString().slice(0, 10);

// CodeRabbit's replies, among PR comments and review-thread replies, that
// recorded a learning after `since`, newest first.
export function learningReplies(
  issueComments: unknown,
  reviewComments: unknown,
  since: Date,
): LearningReply[] {
  const comments = [issueComments, reviewComments].flatMap((input) => {
    const parsed = commentPagesSchema.safeParse(input);
    if (!parsed.success) throw new Error('Invalid GitHub comment response');
    return parsed.data.flat();
  });
  return comments
    .filter(
      (comment) =>
        comment.user?.login === 'coderabbitai[bot]' &&
        LEARNING_RECORDED.test(comment.body ?? '') &&
        Date.parse(comment.created_at) > since.getTime(),
    )
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map((comment) => {
      const recorded = Date.parse(comment.created_at);
      return {
        url: comment.html_url,
        recorded: comment.created_at,
        number: Number(/\/(?:pull|issues)\/(\d+)#/.exec(comment.html_url)?.[1]),
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
    `[#${reply.number}](${reply.url}), recorded ${reply.recordedAt}`;
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
    `CodeRabbit recorded these learnings from pull-request chat since the last report. Each one applies to every later review. Agents comment as the owner, so a learning may come from an agent's argument rather than the owner's ruling. \`.coderabbit.yaml\` holds a new learning for ${HOLD_DAYS} days, then applies it unless the owner rejects it (DEBT-515).\n\n` +
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
    outro +
    `<!-- coderabbit-learnings-through: ${replies[0]?.recorded ?? ''} -->\n`
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

// Runs gh with the given arguments and returns its output. The command line
// supplies the real one below, so tests answer for GitHub without mocking a
// Node module.
type Gh = (args: string[]) => string;

// After the newest learning the last report listed, open or closed, or eight
// days back before any report; never before the hold, since older learnings
// already apply.
export async function coverageStart(
  issues: AlertIssues,
  now: Date,
): Promise<Date> {
  const marked = (await issues.find(LEARNINGS_REVIEW_ISSUE_TITLE))
    .filter((issue) => issue.title === LEARNINGS_REVIEW_ISSUE_TITLE)
    .map((issue) => Date.parse(CURSOR.exec(issue.body)?.[1] ?? ''))
    .filter((time) => Number.isFinite(time));
  const start =
    marked.length > 0
      ? Math.max(...marked)
      : now.getTime() - LOOKBACK_DAYS * DAY_MS;
  return new Date(Math.max(start, now.getTime() - HOLD_DAYS * DAY_MS));
}

// GitHub's `since` filters on the last update, which is never before creation,
// so it keeps every comment created after `start`.
export function readLearningReplies(start: Date, run: Gh): LearningReply[] {
  const since = start.toISOString();
  const read = (endpoint: string): unknown =>
    JSON.parse(
      run([
        'api',
        '--paginate',
        '--slurp',
        `repos/{owner}/{repo}/${endpoint}?since=${since}&per_page=100`,
      ]),
    );
  return learningReplies(
    read('issues/comments'),
    read('pulls/comments'),
    start,
  );
}

// `--dry-run` reports what the job would raise without touching GitHub issues.
export async function runFromCommandLine(
  argv: readonly string[],
  output: Pick<Console, 'log' | 'error'>,
  now: Date,
  run: Gh,
  // The repository owner, whom the issue is assigned to; none for a local run.
  owner: string | null,
): Promise<number> {
  try {
    const issues = createGithubAlertIssues(run, owner);
    const start = await coverageStart(issues, now);
    const replies = readLearningReplies(start, run);
    const flagged = replies.filter((reply) =>
      reply.learnings.some((learning) => learning.suppresses),
    ).length;
    const summary = `CodeRabbit learnings recorded since ${start.toISOString()}: ${replies.length}, ${flagged} telling it to stop raising something`;
    if (argv.includes('--dry-run')) {
      output.log(`${summary} (dry run; no issue touched)`);
      return 0;
    }
    const result = await reportLearnings(replies, issues);
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
/* v8 ignore start */
function gh(args: string[]): string {
  // Credentials come only from the workflow's scoped GH_TOKEN; never log them.
  return execFileSync('gh', args, {
    encoding: 'utf8',
    timeout: 60_000,
    maxBuffer: 64 * 1024 * 1024,
  });
}

// No top-level await: tsx runs this repository's scripts as CommonJS.
if (import.meta.url === executedPath) {
  void runFromCommandLine(
    process.argv,
    console,
    new Date(),
    gh,
    process.env.GITHUB_REPOSITORY_OWNER ?? null,
  ).then((code) => {
    process.exitCode = code;
  });
}
/* v8 ignore stop */
