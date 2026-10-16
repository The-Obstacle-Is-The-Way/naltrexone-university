import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  type AlertIssueSync,
  type AlertIssues,
  createGithubAlertIssues,
  syncAlertIssue,
} from './github-alert-issues';

// DEBT-523: production can lag `main` with nothing reporting it. GitHub
// dropped the push of promotion #1523's merge commit, so it had no CI run and
// no deployment, and Vercel created no production deployment for promotions
// #509 and #1367. Hourly, this job keeps one issue, assigned to the
// repository owner, open while `main`'s head has no passing CI run (a push
// run, or the manual run the guide allows) or no successful production
// deployment. What to do about each:
// docs/guides/release/promote-to-production.md, "No production deployment at all".
export const RELEASE_ISSUE_TITLE = "Production is not serving main's head";

// CI's push run takes about 15 minutes, and the release a few more once it
// passes. A head younger than this is still on its way.
export const RELEASE_GRACE_MS = 45 * 60 * 1000;

// The GitHub deployment environment Vercel reports production releases to.
const PRODUCTION_ENVIRONMENT = 'Production';
// GitHub's largest page. Every page of each list is read, so none is cut short.
const PAGE_SIZE = 100;
const FULL_SHA = /^[0-9a-f]{40}$/;
// A pull request's runs test another commit, the merge with its base.
const MAIN_EVENTS: ReadonlySet<unknown> = new Set([
  'push',
  'workflow_dispatch',
]);

export type MainHead = { sha: string; committedAt: Date };
export type CiRun = { status: string; conclusion: string | null };

export type ReleaseReads = {
  mainHead(): Promise<MainHead>;
  /** CI's push and manual runs of `sha` on `main`. */
  mainCiRuns(sha: string): Promise<CiRun[]>;
  /** The latest status state of each production deployment of `sha`. */
  productionDeploymentStates(sha: string): Promise<string[]>;
};

// Undecided: the head is too new, or CI is still running. An open alarm then
// stays as it is, rather than closing for a head nobody has judged yet.
type ReleaseFinding =
  | { kind: 'released' }
  | { kind: 'undecided' }
  | { kind: 'problem'; text: string };

async function findReleaseProblem(
  reads: ReleaseReads,
  now: Date,
): Promise<ReleaseFinding> {
  const undecided = { kind: 'undecided' } as const;
  const head = await reads.mainHead();
  if (now.getTime() - head.committedAt.getTime() <= RELEASE_GRACE_MS)
    return undecided;
  const subject = `\`main\`'s head \`${head.sha}\`, merged ${head.committedAt.toISOString()}`;

  const runs = await reads.mainCiRuns(head.sha);
  if (runs.length === 0)
    return {
      kind: 'problem',
      text:
        `CI has not run on ${subject}. GitHub may have dropped the push, which also leaves it with no deployment. ` +
        `Run CI on it by hand with \`gh workflow run ci.yml --ref main -f sha=${head.sha}\`, then follow the guide's owner-approved release steps, or let the next promotion release it.`,
    };
  if (runs.some((run) => run.status !== 'completed')) return undecided;
  if (!runs.some((run) => run.conclusion === 'success'))
    return {
      kind: 'problem',
      text: `CI did not pass on it (${runs.map((run) => run.conclusion ?? 'no conclusion').join(', ')}), so the Deployment Check holds production on the previous release: ${subject}. Fix forward, or re-run the run if its failure is not the code's.`,
    };

  const states = await reads.productionDeploymentStates(head.sha);
  if (!states.includes('success'))
    return {
      kind: 'problem',
      text: `CI passed, but GitHub lists no successful production deployment of ${subject}. Vercel may have skipped it. If it was released through the guide's manual route, record the release on GitHub, as the guide's last step says.`,
    };
  return { kind: 'released' };
}

function describeProblem(problem: string): string {
  return (
    `The hourly production release watch found that production may not be serving \`main\`'s head:\n\n- ${problem}\n\n` +
    'What to do: docs/guides/release/promote-to-production.md, "No production deployment at all". ' +
    'The next run closes this issue once the head is released, or a newer head is.\n'
  );
}

export async function watchProductionRelease({
  reads,
  issues,
  now = new Date(),
}: {
  reads: ReleaseReads;
  issues: AlertIssues;
  now?: Date;
}): Promise<AlertIssueSync | 'undecided'> {
  const finding = await findReleaseProblem(reads, now);
  if (finding.kind === 'undecided') return 'undecided';
  return syncAlertIssue(
    issues,
    RELEASE_ISSUE_TITLE,
    finding.kind === 'problem' ? describeProblem(finding.text) : null,
    {
      resolved: "Production serves main's head again.",
      changed: 'The release finding changed; see the description.',
    },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// GitHub does not document the order of a deployment's statuses, so the
// current one is the newest by time, then by ID. An unreadable status could be
// the newest, so it fails the read instead of being skipped.
function newestStatusState(
  pages: unknown,
  invalid: () => Error,
): string | null {
  if (!Array.isArray(pages) || !pages.every(Array.isArray)) throw invalid();
  let newest: { id: number; state: string; at: number } | null = null;
  for (const status of pages.flat()) {
    if (
      !isRecord(status) ||
      typeof status.id !== 'number' ||
      typeof status.state !== 'string'
    )
      throw invalid();
    const at =
      typeof status.created_at === 'string'
        ? Date.parse(status.created_at)
        : Number.NaN;
    if (Number.isNaN(at)) throw invalid();
    if (
      !newest ||
      at > newest.at ||
      (at === newest.at && status.id > newest.id)
    )
      newest = { id: status.id, state: status.state, at };
  }
  return newest?.state ?? null;
}

export function createReleaseReads(
  run: (args: string[]) => string,
): ReleaseReads {
  const read = (path: string): unknown => JSON.parse(run(['api', path]));
  const readEveryPage = (path: string): unknown =>
    JSON.parse(run(['api', '--paginate', '--slurp', path]));
  const invalid = (path: string) =>
    new Error(`Invalid GitHub response: ${path}`);
  return {
    async mainHead() {
      // The commit list, not commits/main: a single commit's response
      // carries every file's patch, over a megabyte for a large promotion.
      const path = 'repos/{owner}/{repo}/commits?sha=main&per_page=1';
      const list = read(path);
      if (!Array.isArray(list)) throw invalid(path);
      const commit: unknown = list[0];
      const committer =
        isRecord(commit) &&
        isRecord(commit.commit) &&
        isRecord(commit.commit.committer)
          ? commit.commit.committer
          : null;
      const committedAt = new Date(String(committer?.date));
      if (
        !isRecord(commit) ||
        typeof commit.sha !== 'string' ||
        !FULL_SHA.test(commit.sha) ||
        Number.isNaN(committedAt.getTime())
      )
        throw invalid(path);
      return { sha: commit.sha, committedAt };
    },
    async mainCiRuns(sha) {
      const path = `repos/{owner}/{repo}/actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=${PAGE_SIZE}`;
      const pages = readEveryPage(path);
      if (
        !Array.isArray(pages) ||
        !pages.every(
          (page) => isRecord(page) && Array.isArray(page.workflow_runs),
        )
      )
        throw invalid(path);
      const runs: CiRun[] = [];
      for (const entry of pages.flatMap((page) => page.workflow_runs)) {
        if (!isRecord(entry) || typeof entry.status !== 'string')
          throw invalid(path);
        if (entry.head_branch !== 'main' || !MAIN_EVENTS.has(entry.event))
          continue;
        runs.push({
          status: entry.status,
          conclusion:
            typeof entry.conclusion === 'string' ? entry.conclusion : null,
        });
      }
      return runs;
    },
    async productionDeploymentStates(sha) {
      const path = `repos/{owner}/{repo}/deployments?sha=${sha}&environment=${PRODUCTION_ENVIRONMENT}&per_page=${PAGE_SIZE}`;
      const pages = readEveryPage(path);
      if (!Array.isArray(pages) || !pages.every(Array.isArray))
        throw invalid(path);
      const states: string[] = [];
      for (const deployment of pages.flat()) {
        if (!isRecord(deployment) || typeof deployment.id !== 'number')
          throw invalid(path);
        const statusPath = `repos/{owner}/{repo}/deployments/${deployment.id}/statuses?per_page=${PAGE_SIZE}`;
        const state = newestStatusState(readEveryPage(statusPath), () =>
          invalid(statusPath),
        );
        if (state !== null) states.push(state);
      }
      return states;
    },
  };
}

export async function runProductionReleaseWatch(
  watch: () => Promise<string>,
  output: Pick<Console, 'log' | 'error'> = console,
): Promise<number> {
  try {
    output.log(`Production release watch: ${await watch()}`);
    return 0;
  } catch (error) {
    output.error(
      `Production release watch failed: ${error instanceof Error ? error.message : String(error)}`,
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
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
  });
}

// No top-level await: tsx runs this repository's scripts as CommonJS.
if (import.meta.url === executedPath) {
  void runProductionReleaseWatch(() =>
    watchProductionRelease({
      reads: createReleaseReads(gh),
      // GitHub notifies an assignee whatever their watch setting.
      issues: createGithubAlertIssues(
        undefined,
        process.env.GITHUB_REPOSITORY_OWNER ?? null,
      ),
    }),
  ).then((code) => {
    process.exitCode = code;
  });
}
/* v8 ignore stop */
