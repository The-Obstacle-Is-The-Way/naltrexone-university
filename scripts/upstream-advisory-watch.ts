import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Dependabot alerts come from GitHub's advisory database, and an upstream
// repository's own advisory can miss it. On 2026-10-07, 12 advisories
// published by this app's dependency repositories were absent, in Next.js,
// Sentry and Vite (DEBT-509). This job reads every dependency repository's
// published advisories and opens one issue per new advisory. Ranges are
// copied, not evaluated, because they can be malformed.

// The repository that publishes each direct dependency's advisories, taken
// from its npm `repository` field, or null when it names none. A test keeps
// the keys equal to package.json's dependencies and devDependencies, so a new
// dependency cannot go unwatched.
export const DEPENDENCY_REPOSITORIES: Readonly<Record<string, string | null>> =
  {
    '@biomejs/biome': 'biomejs/biome',
    '@clerk/nextjs': 'clerk/javascript',
    '@clerk/testing': 'clerk/javascript',
    '@clerk/ui': 'clerk/javascript',
    '@noble/hashes': 'paulmillr/noble-hashes',
    '@playwright/test': 'microsoft/playwright',
    '@sentry/nextjs': 'getsentry/sentry-javascript',
    '@stripe/cli': 'stripe/stripe-cli',
    '@stryker-mutator/core': 'stryker-mutator/stryker-js',
    '@stryker-mutator/vitest-runner': 'stryker-mutator/stryker-js',
    '@tailwindcss/postcss': 'tailwindlabs/tailwindcss',
    '@types/istanbul-lib-coverage': 'DefinitelyTyped/DefinitelyTyped',
    '@types/node': 'DefinitelyTyped/DefinitelyTyped',
    '@types/react': 'DefinitelyTyped/DefinitelyTyped',
    '@types/react-dom': 'DefinitelyTyped/DefinitelyTyped',
    '@typescript/typescript6': 'microsoft/TypeScript',
    '@vitejs/plugin-react': 'vitejs/vite-plugin-react',
    '@vitest/browser-playwright': 'vitest-dev/vitest',
    '@vitest/coverage-v8': 'vitest-dev/vitest',
    'class-variance-authority': 'joe-bell/cva',
    clsx: 'lukeed/clsx',
    dotenv: 'motdotla/dotenv',
    'drizzle-kit': 'drizzle-team/drizzle-orm',
    'drizzle-orm': 'drizzle-team/drizzle-orm',
    'fast-glob': 'mrmlnc/fast-glob',
    'gray-matter': 'jonschlinkert/gray-matter',
    husky: 'typicode/husky',
    'istanbul-lib-coverage': 'istanbuljs/istanbuljs',
    jsdom: 'jsdom/jsdom',
    'lint-staged': 'lint-staged/lint-staged',
    'lucide-react': 'lucide-icons/lucide',
    next: 'vercel/next.js',
    'next-themes': 'pacocoursey/next-themes',
    pino: 'pinojs/pino',
    postgres: 'porsager/postgres',
    'radix-ui': 'radix-ui/primitives',
    react: 'react/react',
    'react-dom': 'react/react',
    'react-markdown': 'remarkjs/react-markdown',
    'rehype-sanitize': 'rehypejs/rehype-sanitize',
    'remark-gfm': 'remarkjs/remark-gfm',
    resend: 'resend/resend-node',
    'server-only': null, // a marker package with no source repository
    stripe: 'stripe/stripe-node',
    'tailwind-merge': 'dcastil/tailwind-merge',
    tailwindcss: 'tailwindlabs/tailwindcss',
    tsx: 'privatenumber/tsx',
    'tw-animate-css': 'Wombosvideo/tw-animate-css',
    typescript: 'microsoft/TypeScript',
    vite: 'vitejs/vite',
    vitest: 'vitest-dev/vitest',
    'vitest-browser-react': 'vitest-community/vitest-browser-react',
    yaml: 'eemeli/yaml',
    zod: 'colinhacks/zod',
  };

export function watchedRepositories(): string[] {
  return [
    ...new Set(
      Object.values(DEPENDENCY_REPOSITORIES).filter(
        (repository): repository is string => repository !== null,
      ),
    ),
  ].sort();
}

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

// Only advisories this run could raise are validated: one malformed historical
// entry must not fail every run and silence new alerts. An entry without a
// readable publication date is still validated, so it fails loudly.
function publishedBefore(entry: unknown, startAt: number): boolean {
  const published = isRecord(entry) ? entry.published_at : undefined;
  if (typeof published !== 'string') return false;
  const publishedAt = Date.parse(published);
  return Number.isFinite(publishedAt) && publishedAt < startAt;
}

export async function listUpstreamAdvisories(
  repository: string,
  run: typeof gh = gh,
  start = WATCH_START,
): Promise<UpstreamAdvisory[]> {
  const startAt = Date.parse(start);
  return slurpedPages(
    run([
      'api',
      '--paginate',
      '--slurp',
      `repos/${repository}/security-advisories?state=published&per_page=100`,
    ]),
    'Invalid GitHub advisory response',
  )
    .filter((entry) => !publishedBefore(entry, startAt))
    .map(parseAdvisory);
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

export type WatchOutcome = { raised: string[]; unreadable: string[] };

// One unreadable repository (renamed, archived or briefly failing) must not
// stop alerts from the others; the run still fails afterwards, so it is seen.
export async function watchUpstreamAdvisories(
  repositories: readonly string[],
  manifest: Readonly<Record<string, string>>,
  issues: AdvisoryIssues,
  list: (repository: string) => Promise<UpstreamAdvisory[]> = (repository) =>
    listUpstreamAdvisories(repository),
): Promise<WatchOutcome> {
  const advisories: UpstreamAdvisory[] = [];
  const unreadable: string[] = [];
  for (const repository of repositories) {
    try {
      advisories.push(...(await list(repository)));
    } catch {
      unreadable.push(repository);
    }
  }
  return {
    raised: await raiseUpstreamAdvisories(advisories, manifest, issues),
    unreadable,
  };
}

export async function runUpstreamAdvisoryWatch(
  check = () =>
    watchUpstreamAdvisories(
      watchedRepositories(),
      directDependencySpecifiers(readFileSync('package.json', 'utf8')),
      createGithubAdvisoryIssues(),
    ),
  output: Pick<Console, 'log' | 'error'> = console,
): Promise<number> {
  try {
    const { raised, unreadable } = await check();
    output.log(
      `Upstream advisories raised: ${raised.length > 0 ? raised.join(', ') : 'none'}`,
    );
    if (unreadable.length === 0) return 0;
    output.error(`Could not read advisories for: ${unreadable.join(', ')}`);
    return 1;
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
