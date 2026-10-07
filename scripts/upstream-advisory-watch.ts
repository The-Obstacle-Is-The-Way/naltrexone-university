import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Dependabot alerts come from GitHub's advisory database, and an upstream
// advisory can miss it: none of Next.js's 2026-09-30 advisories, whose
// version ranges read `16.3.?`, reached it (DEBT-509). This job reads each
// watched repository's own published advisories and opens one issue per new
// advisory. Ranges are copied, not evaluated, because they can be malformed.
export const WATCHED_REPOSITORIES = ['vercel/next.js'] as const;

// Advisories published before this were triaged by hand in DEBT-509.
export const WATCH_START = '2026-10-01T00:00:00Z';

const URGENT_PROCEDURE =
  'docs/dev/supply-chain-overrides.md#urgent-cve-patches-before-the-7-day-cooldown';

export type UpstreamAdvisory = {
  ghsaId: string;
  cveId: string | null;
  severity: string;
  summary: string;
  url: string;
  publishedAt: string;
  vulnerabilities: {
    package: string;
    vulnerableRange: string | null;
    patchedVersions: string | null;
  }[];
};

export type AdvisoryIssue = {
  number: number;
  title: string;
  state: 'OPEN' | 'CLOSED';
};

export type AdvisoryIssues = {
  list(): Promise<AdvisoryIssue[]>;
  create(title: string, body: string): Promise<void>;
};

function packagesOf(advisory: UpstreamAdvisory): string[] {
  return [...new Set(advisory.vulnerabilities.map((entry) => entry.package))];
}

function describeAdvisory(
  advisory: UpstreamAdvisory,
  manifest: Readonly<Record<string, string>>,
): string {
  const affected = advisory.vulnerabilities
    .map(
      (entry) =>
        `- \`${entry.package}\` \`${entry.vulnerableRange ?? 'unknown range'}\`, patched in \`${entry.patchedVersions ?? 'no patched version listed'}\`\n`,
    )
    .join('');
  const pins = packagesOf(advisory)
    .map((name) => {
      const specifier = manifest[name];
      return specifier === undefined
        ? `- \`${name}\` is not a direct dependency in \`package.json\`\n`
        : `- \`package.json\` pins \`${name}\` at \`${specifier}\`\n`;
    })
    .join('');
  return (
    `**${advisory.summary}**\n\n` +
    `- Advisory: ${advisory.url}\n` +
    `- CVE: ${advisory.cveId ?? 'none assigned'}\n` +
    `- Severity: ${advisory.severity}\n` +
    `- Published: ${advisory.publishedAt}\n\n` +
    `Affected, as the advisory states it (ranges can be malformed):\n\n${affected}\n` +
    `This repository:\n\n${pins}\n` +
    'Dependabot may never alert on this advisory. Assess it today against ' +
    `\`${URGENT_PROCEDURE}\`, record the outcome here, and close this issue.\n`
  );
}

export async function raiseUpstreamAdvisories(
  advisories: readonly UpstreamAdvisory[],
  manifest: Readonly<Record<string, string>>,
  issues: AdvisoryIssues,
  start = WATCH_START,
): Promise<string[]> {
  const startAt = Date.parse(start);
  const fresh = advisories.filter(
    (advisory) => Date.parse(advisory.publishedAt) >= startAt,
  );
  if (fresh.length === 0) return [];
  // An issue of any state settles its advisory: a closed one was triaged.
  const known = (await issues.list()).map((issue) => issue.title);
  const raised: string[] = [];
  for (const advisory of fresh) {
    if (
      raised.includes(advisory.ghsaId) ||
      known.some((title) => title.includes(advisory.ghsaId))
    )
      continue;
    await issues.create(
      `Upstream security advisory ${advisory.ghsaId} (${advisory.severity}): ${packagesOf(advisory).join(', ')}`,
      describeAdvisory(advisory, manifest),
    );
    raised.push(advisory.ghsaId);
  }
  return raised;
}

export function directDependencySpecifiers(
  packageJson: string,
): Record<string, string> {
  const manifest: unknown = JSON.parse(packageJson);
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest))
    throw new Error('Invalid package.json dependencies');
  const specifiers: Record<string, string> = {};
  for (const field of ['dependencies', 'devDependencies'] as const) {
    const entries: unknown = (manifest as Record<string, unknown>)[field];
    if (entries === undefined) continue;
    if (!entries || typeof entries !== 'object' || Array.isArray(entries))
      throw new Error('Invalid package.json dependencies');
    for (const [name, specifier] of Object.entries(entries)) {
      if (typeof specifier !== 'string')
        throw new Error('Invalid package.json dependencies');
      specifiers[name] = specifier;
    }
  }
  return specifiers;
}

function gh(args: string[]): string {
  // Credentials come only from the workflow's scoped GH_TOKEN; never log them.
  return execFileSync('gh', args, {
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 32 * 1024 * 1024,
  });
}

function slurpedPages(json: string, error: string): unknown[] {
  const pages: unknown = JSON.parse(json);
  if (!Array.isArray(pages) || !pages.every(Array.isArray))
    throw new Error(error);
  return pages.flat();
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isOptionalString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

function parseAdvisory(entry: unknown): UpstreamAdvisory {
  const invalid = () => new Error('Invalid GitHub advisory response');
  if (!isRecord(entry)) throw invalid();
  const {
    ghsa_id,
    cve_id,
    severity,
    summary,
    html_url,
    published_at,
    vulnerabilities,
  } = entry;
  if (
    typeof ghsa_id !== 'string' ||
    !/^GHSA(-[0-9a-z]{4}){3}$/.test(ghsa_id) ||
    !isOptionalString(cve_id) ||
    typeof severity !== 'string' ||
    typeof summary !== 'string' ||
    typeof html_url !== 'string' ||
    !html_url.startsWith('https://github.com/') ||
    typeof published_at !== 'string' ||
    !Number.isFinite(Date.parse(published_at)) ||
    !Array.isArray(vulnerabilities)
  )
    throw invalid();
  return {
    ghsaId: ghsa_id,
    cveId: cve_id,
    severity,
    summary: summary.replace(/\s+/g, ' ').trim(),
    url: html_url,
    publishedAt: published_at,
    vulnerabilities: vulnerabilities.map((vulnerability: unknown) => {
      if (
        !isRecord(vulnerability) ||
        !isRecord(vulnerability.package) ||
        typeof vulnerability.package.name !== 'string' ||
        !isOptionalString(vulnerability.vulnerable_version_range ?? null) ||
        !isOptionalString(vulnerability.patched_versions ?? null)
      )
        throw invalid();
      return {
        package: vulnerability.package.name,
        vulnerableRange:
          (vulnerability.vulnerable_version_range as string | null) ?? null,
        patchedVersions:
          (vulnerability.patched_versions as string | null) ?? null,
      };
    }),
  };
}

export async function listUpstreamAdvisories(
  repository: string,
  run: typeof gh = gh,
): Promise<UpstreamAdvisory[]> {
  return slurpedPages(
    run([
      'api',
      '--paginate',
      '--slurp',
      `repos/${repository}/security-advisories?state=published&per_page=100`,
    ]),
    'Invalid GitHub advisory response',
  ).map(parseAdvisory);
}

export function createGithubAdvisoryIssues(
  run: typeof gh = gh,
): AdvisoryIssues {
  return {
    // A direct, paginated listing rather than the eventually consistent search
    // index, so an issue opened by the previous run is always seen.
    async list() {
      const issues: AdvisoryIssue[] = [];
      for (const issue of slurpedPages(
        run([
          'api',
          '--paginate',
          '--slurp',
          'repos/{owner}/{repo}/issues?state=all&per_page=100',
        ]),
        'Invalid GitHub issue response',
      )) {
        if (!isRecord(issue)) throw new Error('Invalid GitHub issue response');
        // Pull requests share this endpoint, but their fields are not consumed.
        if ('pull_request' in issue) {
          if (!isRecord(issue.pull_request))
            throw new Error('Invalid GitHub issue response');
          continue;
        }
        const { number, title, state } = issue;
        if (
          typeof number !== 'number' ||
          !Number.isSafeInteger(number) ||
          number <= 0 ||
          typeof title !== 'string' ||
          (state !== 'open' && state !== 'closed')
        )
          throw new Error('Invalid GitHub issue response');
        issues.push({
          number,
          title,
          state: state === 'open' ? 'OPEN' : 'CLOSED',
        });
      }
      return issues;
    },
    async create(title, body) {
      run(['issue', 'create', '--title', title, '--body', body]);
    },
  };
}

export async function runUpstreamAdvisoryWatch(
  check = async () =>
    raiseUpstreamAdvisories(
      (
        await Promise.all(
          WATCHED_REPOSITORIES.map((repository) =>
            listUpstreamAdvisories(repository),
          ),
        )
      ).flat(),
      directDependencySpecifiers(readFileSync('package.json', 'utf8')),
      createGithubAdvisoryIssues(),
    ),
  output: Pick<Console, 'log' | 'error'> = console,
): Promise<number> {
  try {
    const raised = await check();
    output.log(
      `Upstream advisories raised: ${raised.length > 0 ? raised.join(', ') : 'none'}`,
    );
    return 0;
  } catch {
    output.error(
      'Upstream advisory watch failed; inspect the advisory source and GitHub issue access.',
    );
    return 1;
  }
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === executedPath) {
  process.exitCode = await runUpstreamAdvisoryWatch();
}
