import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  type AlertIssueSync,
  type AlertIssues,
  createGithubAlertIssues,
  syncAlertIssue,
} from './github-alert-issues';

// A workaround that waits for an upstream fix has a tracking issue, but
// nothing says when the fix ships. Dependabot cannot: pnpm refuses a patch
// keyed to a version that is no longer installed, so the update fails without
// opening a pull request. This job reads each watched upstream issue and its
// fix pull requests. Once the fix has landed and the package has published a
// release after it, it raises one issue assigned to the repository owner
// (DEBT-500).

export type UpstreamFixWatch = {
  record: string;
  trackingIssue: number;
  // The upstream repository, `owner/name`.
  repository: string;
  issue: number;
  fixPullRequests: readonly number[];
  npmPackage: string;
};

export const UPSTREAM_FIX_WATCHES: readonly UpstreamFixWatch[] = [
  {
    // patches/@stryker-mutator__vitest-runner@9.6.1.patch: on Vitest 5 the
    // runner's test filter matched no nested test.
    record: 'DEBT-500',
    trackingIssue: 1500,
    repository: 'stryker-mutator/stryker-js',
    issue: 6210,
    fixPullRequests: [6214, 6220, 6247],
    npmPackage: '@stryker-mutator/vitest-runner',
  },
];

// One way the fix reached upstream: the issue closed, or a fix PR merged.
export type Landing = { what: string; at: string };
export type Release = { version: string; at: string };

// GitHub writes whole seconds and npm milliseconds, so the ISO strings do not
// sort as text; compare the instants.
function byTime(a: { at: string }, b: { at: string }): number {
  return Date.parse(a.at) - Date.parse(b.at);
}

export type UpstreamReads = {
  landings(watch: UpstreamFixWatch): Promise<Landing[]>;
  // Published, non-withdrawn versions with their release times.
  releases(npmPackage: string): Promise<Release[]>;
};

export function alertTitle(watch: UpstreamFixWatch): string {
  return `Upstream fix released: ${watch.repository}#${watch.issue} (${watch.record})`;
}

function describeAlert(
  watch: UpstreamFixWatch,
  landings: Landing[],
  releases: Release[],
): string {
  const list = (lines: string[]) => lines.map((line) => `- ${line}\n`).join('');
  return (
    `The upstream fix that ${watch.record}'s workaround waits for has landed, and \`${watch.npmPackage}\` has published since:\n\n` +
    list(landings.map(({ what, at }) => `${what} at ${at}`)) +
    `\nReleases since: ${releases.map(({ version, at }) => `${version} (${at})`).join(', ')}.\n\n` +
    `Check that a release contains the fix, then follow #${watch.trackingIssue} to remove the workaround. ` +
    'pnpm installs a release only once it is seven days old. In that pull request, remove this watch from `scripts/upstream-fix-watch.ts` and close this issue.\n'
  );
}

// The alert's description while the fix is released, and null until then.
export async function checkWatch(
  watch: UpstreamFixWatch,
  reads: UpstreamReads,
): Promise<string | null> {
  const landings = (await reads.landings(watch)).sort(byTime);
  const landed = landings[0];
  if (!landed) return null;
  // A pre-release is not what pnpm installs by default.
  const releases = (await reads.releases(watch.npmPackage)).filter(
    (release) => !release.version.includes('-') && byTime(release, landed) > 0,
  );
  return releases.length > 0 ? describeAlert(watch, landings, releases) : null;
}

export async function watchUpstreamFixes(
  watches: readonly UpstreamFixWatch[],
  reads: UpstreamReads,
  issues: AlertIssues,
): Promise<{ title: string; sync: AlertIssueSync }[]> {
  const synced: { title: string; sync: AlertIssueSync }[] = [];
  for (const watch of watches) {
    const title = alertTitle(watch);
    const sync = await syncAlertIssue(
      issues,
      title,
      await checkWatch(watch, reads),
      {
        resolved:
          'No release follows the upstream fix any longer, so this alert is closed.',
        changed:
          'The upstream fix or its releases changed; see the description.',
      },
    );
    synced.push({ title, sync });
  }
  return synced;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createUpstreamReads(
  run: (args: string[]) => string,
  load: typeof fetch = fetch,
): UpstreamReads {
  const read = (path: string): Record<string, unknown> => {
    const response: unknown = JSON.parse(run(['api', path]));
    if (!isRecord(response))
      throw new Error(`Invalid GitHub response: ${path}`);
    return response;
  };
  return {
    async landings(watch) {
      const landings: Landing[] = [];
      const issue = read(`repos/${watch.repository}/issues/${watch.issue}`);
      if (issue.state === 'closed' && typeof issue.closed_at === 'string')
        landings.push({
          what: `${watch.repository}#${watch.issue} closed (${String(issue.state_reason)})`,
          at: issue.closed_at,
        });
      for (const number of watch.fixPullRequests) {
        const pull = read(`repos/${watch.repository}/pulls/${number}`);
        if (typeof pull.merged_at === 'string')
          landings.push({
            what: `${watch.repository}#${number} merged`,
            at: pull.merged_at,
          });
      }
      return landings;
    },
    async releases(npmPackage) {
      const path = `@${encodeURIComponent(npmPackage.slice(1))}`;
      const response = await load(`https://registry.npmjs.org/${path}`, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error('npm registry request failed');
      const document: unknown = await response.json();
      if (
        !isRecord(document) ||
        !isRecord(document.time) ||
        !isRecord(document.versions)
      )
        throw new Error('Invalid npm registry response');
      const { time, versions } = document;
      return Object.keys(versions)
        .flatMap((version) => {
          const at = time[version];
          return typeof at === 'string' ? [{ version, at }] : [];
        })
        .sort(byTime);
    },
  };
}

export async function runUpstreamFixWatch(
  reads: UpstreamReads,
  issues: AlertIssues,
  output: Pick<Console, 'log' | 'error'> = console,
): Promise<number> {
  try {
    const synced = await watchUpstreamFixes(
      UPSTREAM_FIX_WATCHES,
      reads,
      issues,
    );
    for (const { title, sync } of synced) output.log(`${title}: ${sync}`);
    return 0;
  } catch (error) {
    output.error(
      `Upstream fix watch failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
/* v8 ignore start */
function gh(args: string[]): string {
  // Credentials come only from the workflow's scoped GH_TOKEN; never log them.
  return execFileSync('gh', args, { encoding: 'utf8', timeout: 30_000 });
}

// No top-level await: tsx runs this repository's scripts as CommonJS.
if (import.meta.url === executedPath) {
  void runUpstreamFixWatch(
    createUpstreamReads(gh),
    // GitHub notifies an assignee whatever their watch setting.
    createGithubAlertIssues(
      undefined,
      process.env.GITHUB_REPOSITORY_OWNER ?? null,
    ),
  ).then((code) => {
    process.exitCode = code;
  });
}
/* v8 ignore stop */
