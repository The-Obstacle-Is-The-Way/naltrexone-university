import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Dependabot alerts come from GitHub's advisory database, and an upstream
// repository's own advisory reaches it only after GitHub reviews it, days or
// weeks later, or never. On 2026-10-07, 12 advisories published by this app's
// dependency repositories were absent, in Next.js, Sentry and Vite (DEBT-509).
// This job reads the published advisories of every repository behind
// pnpm-lock.yaml and opens one issue per new advisory. Ranges are copied, not
// evaluated, because they are free text and can be malformed.

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

// What the issue body reports for each affected package: package.json's
// specifier for a direct dependency, and every version the lockfile resolves.
export type DependencyVersions = {
  direct: Readonly<Record<string, string>>;
  locked: ReadonlyMap<string, readonly string[]>;
};

export type AdvisoryIssues = {
  list(): Promise<AdvisoryIssue[]>;
  // An urgent issue must reach a person directly, not only the issue list.
  create(title: string, body: string, urgent: boolean): Promise<void>;
  comments(number: number): Promise<string[]>;
  close(number: number, comment: string): Promise<void>;
};

// GitHub's reviewed copy of an advisory: the ranges Dependabot evaluates.
export type ReviewedAdvisory = {
  reviewed: boolean;
  vulnerabilities: {
    ecosystem: string;
    package: string;
    range: string | null;
  }[];
};

export type AdvisoryDatabase = {
  // null while GitHub's database does not have the advisory.
  find(ghsaId: string): Promise<ReviewedAdvisory | null>;
};

type Version = readonly [number, number, number];

function plainVersion(text: string): Version | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(text);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

const COMPARISONS: Readonly<Record<string, (order: number) => boolean>> = {
  '<': (order) => order < 0,
  '<=': (order) => order <= 0,
  '>': (order) => order > 0,
  '>=': (order) => order >= 0,
  '=': (order) => order === 0,
};

// A reviewed range is comparators joined by ", ", all of which must hold,
// such as ">= 4.0.0, < 5.0.9". GitHub's review fixes that syntax; upstream
// text has none (GHSA-rgw5-rvv9-x895 used commas to mean "or"). null when the
// range is not in that syntax, including any prerelease bound.
function inReviewedRange(version: Version, range: string): boolean | null {
  let holds = true;
  for (const comparator of range.split(', ')) {
    const match = /^(<=|>=|<|>|=) (\S+)$/.exec(comparator);
    const compare = match?.[1] ? COMPARISONS[match[1]] : undefined;
    const bound = match?.[2] ? plainVersion(match[2]) : null;
    if (!compare || !bound) return null;
    const order =
      version[0] - bound[0] || version[1] - bound[1] || version[2] - bound[2];
    holds &&= compare(order);
  }
  return holds;
}

// The evidence, one line per reviewed range, when GitHub's review rules out
// every version the lockfile resolves; otherwise null. Anything uncertain
// keeps the advisory open: no review yet, another ecosystem, an unreadable
// range or locked version, or a package the lockfile lacks, since a package
// can compile another in, as Next.js does React's server packages.
export function ruledOutByReview(
  advisory: ReviewedAdvisory | null,
  locked: ReadonlyMap<string, readonly string[]>,
): string[] | null {
  if (!advisory?.reviewed || advisory.vulnerabilities.length === 0) return null;
  const evidence: string[] = [];
  for (const { ecosystem, package: name, range } of advisory.vulnerabilities) {
    const versions = locked.get(name);
    if (ecosystem !== 'npm' || range === null || !versions) return null;
    for (const version of versions) {
      const parsed = plainVersion(version);
      if (!parsed || inReviewedRange(parsed, range) !== false) return null;
    }
    evidence.push(
      `\`${name}\` \`${range}\`: \`pnpm-lock.yaml\` resolves ${versions.map((version) => `\`${version}\``).join(', ')}`,
    );
  }
  return evidence;
}

// The playbook ships a critical or high fix the same day when it affects the
// app, so those advisories are urgent; medium and low wait in the issue list.
const URGENT_SEVERITIES: ReadonlySet<string> = new Set(['critical', 'high']);

function packagesOf(advisory: UpstreamAdvisory): string[] {
  return [...new Set(advisory.vulnerabilities.map((entry) => entry.package))];
}

function describePackage(
  name: string,
  dependencies: DependencyVersions,
): string {
  const versions = dependencies.locked.get(name);
  const resolved = versions
    ? `\`pnpm-lock.yaml\` resolves ${versions.map((version) => `\`${version}\``).join(', ')}`
    : null;
  if (Object.hasOwn(dependencies.direct, name)) {
    const pin = `\`package.json\` pins \`${name}\` at \`${dependencies.direct[name]}\``;
    return `- ${resolved ? `${pin}, and ${resolved}` : pin}\n`;
  }
  return resolved
    ? `- \`${name}\` is an indirect dependency; ${resolved}\n`
    : `- \`${name}\` is not in \`pnpm-lock.yaml\`\n`;
}

function describeAdvisory(
  advisory: UpstreamAdvisory,
  dependencies: DependencyVersions,
): string {
  const affected = advisory.vulnerabilities
    .map(
      (entry) =>
        `- \`${entry.package}\` \`${entry.vulnerableRange ?? 'unknown range'}\`, patched in \`${entry.patchedVersions ?? 'no patched version listed'}\`\n`,
    )
    .join('');
  const pins = packagesOf(advisory)
    .map((name) => describePackage(name, dependencies))
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

export type RaiseOutcome = {
  raised: string[];
  failed: string[];
  // Already reviewed by GitHub, with no locked version affected. Dependabot
  // reads the same review, so no issue opens; each run checks again.
  ruledOut: string[];
};

export async function raiseUpstreamAdvisories(
  advisories: readonly UpstreamAdvisory[],
  dependencies: DependencyVersions,
  issues: AdvisoryIssues,
  database: AdvisoryDatabase = githubAdvisoryDatabase(),
  start = WATCH_START,
): Promise<RaiseOutcome> {
  const startAt = Date.parse(start);
  const fresh = advisories.filter(
    (advisory) => Date.parse(advisory.publishedAt) >= startAt,
  );
  const outcome: RaiseOutcome = { raised: [], failed: [], ruledOut: [] };
  if (fresh.length === 0) return outcome;
  // An issue of any state settles its advisory: a closed one was triaged.
  // Without this list nothing can be deduplicated, so its failure fails all.
  const known = (await issues.list()).map((issue) => issue.title);
  const handled = new Set<string>();
  for (const advisory of fresh) {
    if (
      handled.has(advisory.ghsaId) ||
      known.some((title) => title.includes(advisory.ghsaId))
    )
      continue;
    handled.add(advisory.ghsaId);
    // A database that cannot be read rules nothing out, so the issue opens.
    const review = await database.find(advisory.ghsaId).catch(() => null);
    if (ruledOutByReview(review, dependencies.locked)) {
      outcome.ruledOut.push(advisory.ghsaId);
      continue;
    }
    // One issue that cannot be opened must not stop the ones after it; the
    // next run retries it, and the run reports it and fails.
    try {
      await issues.create(
        `Upstream security advisory ${advisory.ghsaId} (${advisory.severity}): ${packagesOf(advisory).join(', ')}`,
        describeAdvisory(advisory, dependencies),
        URGENT_SEVERITIES.has(advisory.severity),
      );
      outcome.raised.push(advisory.ghsaId);
    } catch {
      outcome.failed.push(advisory.ghsaId);
    }
  }
  return outcome;
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

export type LockedPackage = { name: string; version: string };

const LOCKED_PACKAGE = /^ {2}'?((?:@[^@/\s']+\/)?[^@/\s']+)@([^\s']+)'?:$/;

// pnpm-lock.yaml (format 9.0) lists each resolved package once under
// `packages:`, keyed `name@version`. Anything else fails the run, so a format
// change cannot shrink the watch silently.
export function lockfilePackages(lockfile: string): LockedPackage[] {
  const unsupported = () => new Error('Unsupported pnpm-lock.yaml');
  const lines = lockfile.split('\n');
  if (!lines.includes("lockfileVersion: '9.0'")) throw unsupported();
  const start = lines.indexOf('packages:');
  if (start === -1) throw unsupported();
  const packages: LockedPackage[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    if (!/^ {2}\S/.test(line)) continue;
    const match = LOCKED_PACKAGE.exec(line);
    if (!match?.[1] || !match[2]) throw unsupported();
    packages.push({ name: match[1], version: match[2] });
  }
  return packages;
}

export function lockedVersions(
  packages: readonly LockedPackage[],
): Map<string, string[]> {
  const locked = new Map<string, string[]>();
  for (const { name, version } of packages)
    locked.set(name, [...(locked.get(name) ?? []), version].sort());
  return locked;
}

// The result becomes part of an API path, so only a plain owner/name passes.
// Older accounts may end in a hyphen, as color-convert's `Qix-` does.
const GITHUB_OWNER = /^[A-Za-z0-9][A-Za-z0-9-]*$/;
const GITHUB_NAME = /^[A-Za-z0-9._-]+$/;

function ownerAndName(owner: string, name: string): string | null {
  const repository = name.replace(/\.git$/, '');
  return GITHUB_OWNER.test(owner) &&
    GITHUB_NAME.test(repository) &&
    repository !== '.' &&
    repository !== '..'
    ? `${owner}/${repository}`
    : null;
}

// The GitHub repository an npm manifest's `repository` field names, in any of
// the forms npm accepts, or null when it names none or another host.
export function githubRepository(field: unknown): string | null {
  const url = isRecord(field) ? field.url : field;
  if (typeof url !== 'string') return null;
  const shorthand = /^(?:github:)?([^/:@\s]+)\/([^/:@\s]+)$/.exec(url);
  if (shorthand?.[1] && shorthand[2])
    return ownerAndName(shorthand[1], shorthand[2]);
  const scp = /^git@github\.com:([^/]+)\/([^/]+)$/.exec(url);
  if (scp?.[1] && scp[2]) return ownerAndName(scp[1], scp[2]);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== 'github.com' && parsed.hostname !== 'www.github.com')
    return null;
  const [owner, name] = parsed.pathname.split('/').filter(Boolean);
  return owner && name ? ownerAndName(owner, name) : null;
}

// The `repository` field of one published version, from the npm registry.
export async function registryRepository(
  name: string,
  version: string,
  load: typeof fetch = fetch,
): Promise<unknown> {
  const path = name.startsWith('@')
    ? `@${encodeURIComponent(name.slice(1))}`
    : encodeURIComponent(name);
  const response = await load(
    `https://registry.npmjs.org/${path}/${encodeURIComponent(version)}`,
    { signal: AbortSignal.timeout(30_000) },
  );
  if (!response.ok) throw new Error('npm registry request failed');
  const manifest: unknown = await response.json();
  if (!isRecord(manifest)) throw new Error('Invalid npm registry response');
  return manifest.repository;
}

export type IndirectRepositories = {
  repositories: string[];
  // Packages whose manifest names no GitHub repository.
  unwatched: string[];
  // Packages whose manifest could not be read; the run fails on these.
  unreadable: string[];
};

// The repositories behind the given packages that are not already watched,
// compared case-insensitively as GitHub does. Manifests are read a few at a
// time, and one that cannot be read does not stop the others. A failed read
// is tried once more, so a passing registry error does not fail the run.
export async function indirectRepositories(
  packages: readonly LockedPackage[],
  watched: readonly string[],
  read: (name: string, version: string) => Promise<unknown> = (name, version) =>
    registryRepository(name, version),
  concurrency = 8,
): Promise<IndirectRepositories> {
  const fields: { field: unknown; failed: boolean }[] = [];
  let next = 0;
  const worker = async () => {
    for (let index = next++; index < packages.length; index = next++) {
      const entry = packages[index];
      if (!entry) continue;
      fields[index] = { field: undefined, failed: true };
      for (let attempt = 0; attempt < 2 && fields[index]?.failed; attempt++) {
        try {
          fields[index] = {
            field: await read(entry.name, entry.version),
            failed: false,
          };
        } catch {}
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  // Results are gathered in lockfile order, so the spelling kept for a
  // repository named in different cases does not depend on timing.
  const known = new Set(watched.map((repository) => repository.toLowerCase()));
  const found = new Map<string, string>();
  const unwatched: string[] = [];
  const unreadable: string[] = [];
  packages.forEach(({ name, version }, index) => {
    const result = fields[index];
    if (!result || result.failed) {
      unreadable.push(`${name}@${version}`);
      return;
    }
    const repository = githubRepository(result.field);
    if (repository === null) unwatched.push(`${name}@${version}`);
    else if (!known.has(repository.toLowerCase()))
      found.set(
        repository.toLowerCase(),
        found.get(repository.toLowerCase()) ?? repository,
      );
  });
  return {
    repositories: [...found.values()].sort(),
    unwatched: unwatched.sort(),
    unreadable: unreadable.sort(),
  };
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

// A deleted repository can publish nothing; GitHub answers 404 for it.
export class RepositoryNotFound extends Error {
  constructor(repository: string) {
    super(`Repository not found: ${repository}`);
    this.name = 'RepositoryNotFound';
  }
}

// The workflow token allows 1,000 requests an hour. Once one read is refused
// for that, the rest would be too, so the run stops; the next reads them all.
export class RateLimited extends Error {
  constructor() {
    super('GitHub API rate limit exceeded');
    this.name = 'RateLimited';
  }
}

export async function listUpstreamAdvisories(
  repository: string,
  run: typeof gh = gh,
  start = WATCH_START,
): Promise<UpstreamAdvisory[]> {
  const startAt = Date.parse(start);
  let pages: string;
  try {
    pages = run([
      'api',
      '--paginate',
      '--slurp',
      `repos/${repository}/security-advisories?state=published&per_page=100`,
    ]);
  } catch (error) {
    const stderr =
      isRecord(error) && typeof error.stderr === 'string' ? error.stderr : '';
    if (stderr.includes('(HTTP 404)')) throw new RepositoryNotFound(repository);
    if (/rate limit/i.test(stderr)) throw new RateLimited();
    throw error;
  }
  return slurpedPages(pages, 'Invalid GitHub advisory response')
    .filter((entry) => !publishedBefore(entry, startAt))
    .map(parseAdvisory);
}

// The account GitHub Actions opens issues as.
const WATCHER_LOGIN = 'github-actions[bot]';

// GitHub notifies an assignee whatever their watch setting, so urgent issues
// are assigned to the repository owner (set by GitHub Actions). A local run
// has no owner and opens the issue unassigned.
export function createGithubAdvisoryIssues(
  run: typeof gh = gh,
  urgentAssignee: string | null = process.env.GITHUB_REPOSITORY_OWNER ?? null,
): AdvisoryIssues {
  // Anyone can open an issue in this public repository. Only the watcher's and
  // the owner's issues are listed, so a stranger's issue titled with a GHSA ID
  // can neither silence that advisory nor be closed by the watcher.
  const trusted = new Set([
    WATCHER_LOGIN,
    ...(urgentAssignee ? [urgentAssignee] : []),
  ]);
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
        const { number, title, state, user } = issue;
        if (
          typeof number !== 'number' ||
          !Number.isSafeInteger(number) ||
          number <= 0 ||
          typeof title !== 'string' ||
          (state !== 'open' && state !== 'closed') ||
          !isRecord(user) ||
          typeof user.login !== 'string'
        )
          throw new Error('Invalid GitHub issue response');
        if (!trusted.has(user.login)) continue;
        issues.push({
          number,
          title,
          state: state === 'open' ? 'OPEN' : 'CLOSED',
        });
      }
      return issues;
    },
    async create(title, body, urgent) {
      run([
        'issue',
        'create',
        '--title',
        title,
        '--body',
        body,
        ...(urgent && urgentAssignee ? ['--assignee', urgentAssignee] : []),
      ]);
    },
    async comments(number) {
      return slurpedPages(
        run([
          'api',
          '--paginate',
          '--slurp',
          `repos/{owner}/{repo}/issues/${number}/comments?per_page=100`,
        ]),
        'Invalid GitHub comment response',
      ).map((comment) => {
        if (!isRecord(comment) || typeof comment.body !== 'string')
          throw new Error('Invalid GitHub comment response');
        return comment.body;
      });
    },
    async close(number, comment) {
      run([
        'issue',
        'close',
        String(number),
        '--reason',
        'not planned',
        '--comment',
        comment,
      ]);
    },
  };
}

const GHSA_ID = /^GHSA(-[0-9a-z]{4}){3}$/;

export function githubAdvisoryDatabase(run: typeof gh = gh): AdvisoryDatabase {
  return {
    async find(ghsaId) {
      // The identifier becomes an API path.
      if (!GHSA_ID.test(ghsaId)) throw new Error('Invalid GHSA ID');
      let response: string;
      try {
        response = run(['api', `advisories/${ghsaId}`]);
      } catch (error) {
        if (
          isRecord(error) &&
          typeof error.stderr === 'string' &&
          error.stderr.includes('(HTTP 404)')
        )
          return null;
        throw error;
      }
      const invalid = () =>
        new Error('Invalid GitHub advisory database response');
      const advisory: unknown = JSON.parse(response);
      if (
        !isRecord(advisory) ||
        !isOptionalString(advisory.github_reviewed_at ?? null) ||
        !Array.isArray(advisory.vulnerabilities)
      )
        throw invalid();
      return {
        reviewed: typeof advisory.github_reviewed_at === 'string',
        vulnerabilities: advisory.vulnerabilities.map((entry: unknown) => {
          const range = isRecord(entry)
            ? (entry.vulnerable_version_range ?? null)
            : undefined;
          if (
            !isRecord(entry) ||
            !isRecord(entry.package) ||
            typeof entry.package.ecosystem !== 'string' ||
            typeof entry.package.name !== 'string' ||
            !isOptionalString(range)
          )
            throw invalid();
          return {
            ecosystem: entry.package.ecosystem,
            package: entry.package.name,
            range,
          };
        }),
      };
    },
  };
}

const ADVISORY_ISSUE = /^Upstream security advisory (GHSA(?:-[0-9a-z]{4}){3}) /;

// Marks the watcher's own closing comment, so an issue a person reopens is
// not closed again.
const REVIEW_CLOSE_MARKER =
  '<!-- upstream-advisory-watch: closed after GitHub review -->';

export type CloseOutcome = { closed: string[]; failed: string[] };

// An issue opens on the upstream advisory's own word. Once GitHub's review,
// the data Dependabot reads, rules out every locked version, the issue is
// closed with that evidence. Checked against the 95 advisories published
// from 2026-06-14 to 2026-10-08, this would have closed none that
// Dependabot alerted on.
export async function closeReviewedIssues(
  issues: AdvisoryIssues,
  locked: ReadonlyMap<string, readonly string[]>,
  database: AdvisoryDatabase,
): Promise<CloseOutcome> {
  const outcome: CloseOutcome = { closed: [], failed: [] };
  for (const issue of await issues.list()) {
    const ghsaId =
      issue.state === 'OPEN' ? ADVISORY_ISSUE.exec(issue.title)?.[1] : null;
    if (!ghsaId) continue;
    try {
      const evidence = ruledOutByReview(await database.find(ghsaId), locked);
      if (!evidence) continue;
      const comments = await issues.comments(issue.number);
      if (comments.some((body) => body.includes(REVIEW_CLOSE_MARKER))) continue;
      await issues.close(
        issue.number,
        'GitHub has reviewed this advisory, and its ranges include no version `pnpm-lock.yaml` resolves:\n\n' +
          evidence.map((line) => `- ${line}\n`).join('') +
          '\nClosed automatically, since Dependabot reads the same review. ' +
          'Reopen this issue if the app is affected anyway, for example ' +
          'through code a package compiles in; the watcher will not close it ' +
          `again.\n\n${REVIEW_CLOSE_MARKER}\n`,
      );
      outcome.closed.push(ghsaId);
    } catch {
      outcome.failed.push(ghsaId);
    }
  }
  return outcome;
}

export type WatchedRepositories = {
  // Repositories of package.json's dependencies: every advisory is raised.
  direct: readonly string[];
  // Repositories reached only through indirect dependencies.
  indirect: readonly string[];
};

// From a repository reached only through indirect dependencies, medium and
// low advisories are left to Dependabot: in the year to 2026-10-08, 106 of
// 109 reached GitHub's database, and none of the other three affected this
// app. Critical and high ones are raised, because the same-day rule acts on
// them and a third of them arrived over a week late.
const LEFT_TO_DEPENDABOT: ReadonlySet<string> = new Set(['medium', 'low']);

export type WatchOutcome = RaiseOutcome & {
  closed: string[];
  read: number;
  unreadable: string[];
  unwatched: string[];
};

// One unreadable repository (archived or briefly failing) must not stop
// alerts from the others; the run still fails afterwards, so it is seen.
export async function watchUpstreamAdvisories(
  repositories: WatchedRepositories,
  dependencies: DependencyVersions,
  issues: AdvisoryIssues,
  list: (repository: string) => Promise<UpstreamAdvisory[]> = (repository) =>
    listUpstreamAdvisories(repository),
  database: AdvisoryDatabase = githubAdvisoryDatabase(),
): Promise<WatchOutcome> {
  const advisories: UpstreamAdvisory[] = [];
  const unreadable: string[] = [];
  const unwatched: string[] = [];
  let read = 0;
  const sources = [
    ...repositories.direct.map((repository) => ({ repository, direct: true })),
    ...repositories.indirect.map((repository) => ({
      repository,
      direct: false,
    })),
  ];
  for (const { repository, direct } of sources) {
    try {
      const listed = await list(repository);
      advisories.push(
        ...(direct
          ? listed
          : listed.filter(
              (advisory) => !LEFT_TO_DEPENDABOT.has(advisory.severity),
            )),
      );
      read += 1;
    } catch (error) {
      if (error instanceof RateLimited) throw error;
      // A deleted indirect repository narrows the watch and is reported; a
      // direct dependency's must be noticed and fixed, so it fails the run.
      if (!direct && error instanceof RepositoryNotFound)
        unwatched.push(repository);
      else unreadable.push(repository);
    }
  }
  const raised = await raiseUpstreamAdvisories(
    advisories,
    dependencies,
    issues,
    database,
  );
  const reviewed = await closeReviewedIssues(
    issues,
    dependencies.locked,
    database,
  );
  return {
    ...raised,
    failed: [...raised.failed, ...reviewed.failed],
    closed: reviewed.closed,
    read,
    unreadable,
    unwatched,
  };
}

async function watchLockfile(): Promise<WatchOutcome> {
  const packages = lockfilePackages(readFileSync('pnpm-lock.yaml', 'utf8'));
  const direct = watchedRepositories();
  // Direct dependencies are mapped by hand and tested; the rest are resolved.
  const indirect = await indirectRepositories(
    packages.filter(
      ({ name }) => !Object.hasOwn(DEPENDENCY_REPOSITORIES, name),
    ),
    direct,
  );
  const outcome = await watchUpstreamAdvisories(
    { direct, indirect: indirect.repositories },
    {
      direct: directDependencySpecifiers(readFileSync('package.json', 'utf8')),
      locked: lockedVersions(packages),
    },
    createGithubAdvisoryIssues(),
  );
  return {
    ...outcome,
    unreadable: [...indirect.unreadable, ...outcome.unreadable],
    unwatched: [...indirect.unwatched, ...outcome.unwatched],
  };
}

export async function runUpstreamAdvisoryWatch(
  check: () => Promise<WatchOutcome> = watchLockfile,
  output: Pick<Console, 'log' | 'error'> = console,
): Promise<number> {
  try {
    const { raised, failed, ruledOut, closed, read, unreadable, unwatched } =
      await check();
    output.log(
      `Upstream advisories raised: ${raised.length > 0 ? raised.join(', ') : 'none'}`,
    );
    if (ruledOut.length > 0)
      output.log(
        `Not raised, ruled out by GitHub’s review: ${ruledOut.join(', ')}`,
      );
    if (closed.length > 0)
      output.log(`Closed after GitHub’s review: ${closed.join(', ')}`);
    output.log(`Repositories read: ${read}`);
    if (unwatched.length > 0)
      output.log(
        `Not watched, no GitHub repository to read: ${unwatched.join(', ')}`,
      );
    if (failed.length > 0)
      output.error(`Could not open or close issues for: ${failed.join(', ')}`);
    if (unreadable.length > 0)
      output.error(`Could not read advisories for: ${unreadable.join(', ')}`);
    return failed.length > 0 || unreadable.length > 0 ? 1 : 0;
  } catch (error) {
    output.error(
      error instanceof RateLimited
        ? 'GitHub’s API rate limit ran out, so nothing was raised; the next run reads every repository again.'
        : 'Upstream advisory watch failed; inspect the advisory source and GitHub issue access.',
    );
    return 1;
  }
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === executedPath) {
  process.exitCode = await runUpstreamAdvisoryWatch();
}
