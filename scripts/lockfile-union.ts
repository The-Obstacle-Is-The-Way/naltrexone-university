import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { isAlias, isScalar, parseDocument, visit } from 'yaml';

// Verifies that a repo-owned bundle lockfile changes exactly the union of the
// changes its source Dependabot lockfiles make against their shared base
// (issue #885). It reads package-manager-generated lockfiles and never writes,
// merges or synthesizes one. The CLI is scripts/verify-lockfile-union.ts; see
// docs/dev/dependency-update-protocol.md.

const USAGE =
  'Usage: tsx scripts/verify-lockfile-union.ts --base <rev|file> --source <rev|file> --source <rev|file> [--source <rev|file> ...] --candidate <rev|file>';

// Each failure category has its own bit, so the exit code names every
// category present; 2 is reserved for usage and input errors.
export const LOCKFILE_UNION_EXIT = {
  usage: 2,
  extra: 4,
  missing: 8,
  unmatched: 16,
  conflict: 32,
} as const;

const FINDINGS_SHOWN = 20;

export class LockfileUnionInputError extends Error {
  override name = 'LockfileUnionInputError';
}

export type LockfileText = { label: string; text: string };
export type LockfileSection =
  | 'importers'
  | 'packages'
  | 'snapshots'
  | 'metadata';
export type UnionFinding = {
  section: LockfileSection;
  entry: string;
  detail: string;
};
export type SectionCounts = {
  sources: number[];
  union: number;
  candidate: number;
  unionKeyDeltas: number;
  candidateKeyDeltas: number;
  extra: number;
  missing: number;
  unmatched: number;
  conflicts: number;
};
export type LockfileUnionReport = {
  labels: { base: string; sources: string[]; candidate: string };
  sections: Record<LockfileSection, SectionCounts>;
  extra: UnionFinding[];
  missing: UnionFinding[];
  unmatched: UnionFinding[];
  conflicts: UnionFinding[];
};

const SECTIONS: LockfileSection[] = [
  'importers',
  'packages',
  'snapshots',
  'metadata',
];
const DEPENDENCY_FIELDS = new Set([
  'dependencies',
  'devDependencies',
  'optionalDependencies',
]);

type Mapping = Record<string, unknown>;
// Entry id (a JSON-encoded path) -> canonical JSON of the entry's value.
type Entries = Map<string, string>;
// A change maps an entry id to its new value; undefined means removed.
type Changes = Map<string, string | undefined>;

function isMapping(value: unknown): value is Mapping {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Key order and YAML layout never count as a change.
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, nested: unknown) =>
    isMapping(nested)
      ? Object.fromEntries(
          Object.entries(nested).sort(([a], [b]) => (a < b ? -1 : 1)),
        )
      : nested,
  );
}

function mappingOrEmpty(value: unknown, what: string, label: string): Mapping {
  if (value === undefined || value === null) return {};
  if (!isMapping(value)) {
    throw new LockfileUnionInputError(`${label}: ${what} must be a mapping`);
  }
  return value;
}

function parseLockfile({ label, text }: LockfileText): Mapping {
  const parsed = parseDocument(text);
  const [firstError] = parsed.errors;
  if (firstError) {
    throw new LockfileUnionInputError(
      `${label}: invalid YAML (${firstError.message})`,
    );
  }
  // pnpm writes none of these. Each could make different documents compare
  // equal (a tag or key converted to the same value, NaN and Infinity becoming
  // null) or, for an alias cycle, recurse without end, so each is an input error.
  // pnpm writes no `---` marker and no directives. pnpm 11 reads a document
  // that starts with `---` as an environment document rather than the
  // lockfile, and a %YAML 1.1 directive changes how plain scalars such as
  // `yes` parse, so either one would make this parser and pnpm's read
  // different documents. Every directive needs that marker.
  let forbidden: string | undefined = parsed.directives.docStart
    ? 'document markers and directives'
    : undefined;
  visit(parsed, {
    Node: (_key, node) => {
      if (isAlias(node) || node.anchor) forbidden = 'anchors and aliases';
      else if (node.tag) forbidden = 'explicit tags';
      else if (
        isScalar(node) &&
        typeof node.value === 'number' &&
        !Number.isFinite(node.value)
      ) {
        forbidden = 'non-finite numbers';
      }
      return forbidden ? visit.BREAK : undefined;
    },
    Pair: (_key, pair) => {
      if (!isScalar(pair.key) || typeof pair.key.value !== 'string') {
        forbidden = 'non-string keys';
      }
      return forbidden ? visit.BREAK : undefined;
    },
  });
  if (forbidden) {
    throw new LockfileUnionInputError(
      `${label}: YAML ${forbidden} are not allowed in a pnpm lockfile`,
    );
  }
  const document: unknown = parsed.toJS();
  if (!isMapping(document) || !('lockfileVersion' in document)) {
    throw new LockfileUnionInputError(
      `${label}: not a pnpm lockfile (no lockfileVersion)`,
    );
  }
  return document;
}

// Flattens a lockfile into comparable entries: one per importer dependency,
// per package, per snapshot, and per top-level metadata key (one level deep).
function lockfileEntries(lockfile: LockfileText): Entries {
  const document = parseLockfile(lockfile);
  const entries: Entries = new Map();
  const add = (entryPath: string[], value: unknown) =>
    entries.set(JSON.stringify(entryPath), canonical(value));

  const importers = mappingOrEmpty(
    document.importers,
    'importers',
    lockfile.label,
  );
  for (const [importer, fields] of Object.entries(importers)) {
    if (!isMapping(fields)) {
      throw new LockfileUnionInputError(
        `${lockfile.label}: importer "${importer}" must be a mapping`,
      );
    }
    // The importer's presence is its own entry, so adding or removing an
    // importer with no fields still counts as a change.
    add(['importers', importer], 'present');
    for (const [field, fieldValue] of Object.entries(fields)) {
      if (!DEPENDENCY_FIELDS.has(field)) {
        add(['importers', importer, field], fieldValue);
        continue;
      }
      const dependencies = mappingOrEmpty(
        fieldValue,
        `importer "${importer}" ${field}`,
        lockfile.label,
      );
      for (const [name, dependency] of Object.entries(dependencies)) {
        add(['importers', importer, field, name], dependency);
      }
    }
  }
  for (const section of ['packages', 'snapshots'] as const) {
    const values = mappingOrEmpty(document[section], section, lockfile.label);
    for (const [key, value] of Object.entries(values)) {
      add([section, key], value);
    }
  }
  for (const [key, value] of Object.entries(document)) {
    if (key === 'importers' || key === 'packages' || key === 'snapshots') {
      continue;
    }
    if (!isMapping(value)) {
      add([key], value);
      continue;
    }
    for (const [subkey, subvalue] of Object.entries(value)) {
      add([key, subkey], subvalue);
    }
  }
  return entries;
}

function changesFrom(base: Entries, target: Entries): Changes {
  const changes: Changes = new Map();
  for (const id of new Set([...base.keys(), ...target.keys()])) {
    if (base.get(id) !== target.get(id)) changes.set(id, target.get(id));
  }
  return changes;
}

function entryPath(id: string): string[] {
  return JSON.parse(id);
}

function sectionOf(id: string): LockfileSection {
  const [first] = entryPath(id);
  return first === 'importers' || first === 'packages' || first === 'snapshots'
    ? first
    : 'metadata';
}

function preview(value: string): string {
  return value.length > 60 ? `${value.slice(0, 57)}...` : value;
}

export function compareLockfileUnion(input: {
  base: LockfileText;
  sources: LockfileText[];
  candidate: LockfileText;
}): LockfileUnionReport {
  const base = lockfileEntries(input.base);
  const sources = input.sources.map((source) => ({
    label: source.label,
    changes: changesFrom(base, lockfileEntries(source)),
  }));
  const candidateChanges = changesFrom(base, lockfileEntries(input.candidate));

  // For each changed entry, the distinct values the sources propose and the
  // sources proposing each one.
  const proposals = new Map<string, Map<string | undefined, string[]>>();
  for (const { label, changes } of sources) {
    for (const [id, value] of changes) {
      const byValue = proposals.get(id) ?? new Map();
      byValue.set(value, [...(byValue.get(value) ?? []), label]);
      proposals.set(id, byValue);
    }
  }

  const verb = (id: string, value: string | undefined) =>
    value === undefined ? 'removes' : base.has(id) ? 'changes' : 'adds';
  const finding = (id: string, detail: string): UnionFinding => ({
    section: sectionOf(id),
    entry: entryPath(id).join(' > '),
    detail,
  });
  const emptyCounts = (section: LockfileSection): SectionCounts => ({
    sources: sources.map(
      ({ changes }) =>
        [...changes.keys()].filter((id) => sectionOf(id) === section).length,
    ),
    union: 0,
    candidate: 0,
    unionKeyDeltas: 0,
    candidateKeyDeltas: 0,
    extra: 0,
    missing: 0,
    unmatched: 0,
    conflicts: 0,
  });

  const report: LockfileUnionReport = {
    labels: {
      base: input.base.label,
      sources: input.sources.map((source) => source.label),
      candidate: input.candidate.label,
    },
    sections: {
      importers: emptyCounts('importers'),
      packages: emptyCounts('packages'),
      snapshots: emptyCounts('snapshots'),
      metadata: emptyCounts('metadata'),
    },
    extra: [],
    missing: [],
    unmatched: [],
    conflicts: [],
  };
  const counts = (id: string) => report.sections[sectionOf(id)];

  for (const [id, byValue] of proposals) {
    counts(id).union += 1;
    if (!base.has(id) || byValue.has(undefined)) counts(id).unionKeyDeltas += 1;
    const candidateChanged = candidateChanges.has(id);
    const candidateValue = candidateChanges.get(id);

    if (byValue.size > 1) {
      const proposed = [...byValue].map(([value, labels]) =>
        value === undefined
          ? `${labels.join(', ')} removes it`
          : `${labels.join(', ')} ${verb(id, value)} it to ${preview(value)}`,
      );
      const taken = candidateChanged ? byValue.get(candidateValue) : undefined;
      const outcome = taken
        ? `candidate takes ${taken.join(', ')}`
        : candidateChanged
          ? 'candidate value matches no source'
          : 'candidate keeps the base value';
      report.conflicts.push(finding(id, `${proposed.join('; ')}; ${outcome}`));
      counts(id).conflicts += 1;
      continue;
    }

    const [[value, labels] = [undefined, []]] = byValue;
    if (!candidateChanged) {
      report.missing.push(
        finding(id, `${labels.join(', ')} ${verb(id, value)}`),
      );
      counts(id).missing += 1;
    } else if (candidateValue !== value) {
      report.unmatched.push(
        finding(id, `candidate value differs from ${labels.join(', ')}`),
      );
      counts(id).unmatched += 1;
    }
  }

  for (const [id, value] of candidateChanges) {
    counts(id).candidate += 1;
    if (!base.has(id) || value === undefined) {
      counts(id).candidateKeyDeltas += 1;
    }
    if (!proposals.has(id)) {
      report.extra.push(finding(id, `candidate ${verb(id, value)}`));
      counts(id).extra += 1;
    }
  }

  return report;
}

export function lockfileUnionExitCode(report: LockfileUnionReport): number {
  return (
    (report.extra.length > 0 ? LOCKFILE_UNION_EXIT.extra : 0) |
    (report.missing.length > 0 ? LOCKFILE_UNION_EXIT.missing : 0) |
    (report.unmatched.length > 0 ? LOCKFILE_UNION_EXIT.unmatched : 0) |
    (report.conflicts.length > 0 ? LOCKFILE_UNION_EXIT.conflict : 0)
  );
}

export function formatLockfileUnionReport(report: LockfileUnionReport): string {
  const quote = (label: string) => `\`${label}\``;
  const lines = [
    '## Lockfile union check',
    '',
    `Base: ${quote(report.labels.base)}. Sources: ${report.labels.sources.map(quote).join(', ')}. Candidate: ${quote(report.labels.candidate)}.`,
    '',
    '| Section | Source changed entries | Union | Candidate | Key deltas (union / candidate) | Extra | Missing | Unmatched | Conflicts |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...SECTIONS.map((section) => {
      const counts = report.sections[section];
      return `| ${section} | ${counts.sources.join(' / ')} | ${counts.union} | ${counts.candidate} | ${counts.unionKeyDeltas} / ${counts.candidateKeyDeltas} | ${counts.extra} | ${counts.missing} | ${counts.unmatched} | ${counts.conflicts} |`;
    }),
    '',
  ];

  const exitCode = lockfileUnionExitCode(report);
  if (exitCode === 0) {
    lines.push(
      'PASS: the candidate changes exactly the union of the source changes.',
    );
    return lines.join('\n');
  }

  const categories = [
    ['extra', report.extra, 'the candidate changes entries no source changes'],
    ['missing', report.missing, 'source changes the candidate omits'],
    ['unmatched', report.unmatched, 'candidate values no source proposes'],
    [
      'conflicting',
      report.conflicts,
      'sources disagree, so the bundle needs a deliberate choice',
    ],
  ] as const;
  const present = categories.filter(([, findings]) => findings.length > 0);
  lines.push(
    `FAIL (exit ${exitCode}): ${present.map(([name, findings]) => `${findings.length} ${name}`).join(', ')}.`,
  );
  for (const [name, findings, meaning] of present) {
    lines.push('', `### ${name[0]?.toUpperCase()}${name.slice(1)}: ${meaning}`);
    for (const { entry, detail } of findings.slice(0, FINDINGS_SHOWN)) {
      lines.push(`- \`${entry}\`: ${detail}`);
    }
    if (findings.length > FINDINGS_SHOWN) {
      lines.push(`- …and ${findings.length - FINDINGS_SHOWN} more`);
    }
  }
  return lines.join('\n');
}

export function parseLockfileUnionArgs(argv: string[]): {
  base: string;
  sources: string[];
  candidate: string;
} {
  const usage = (problem: string) =>
    new LockfileUnionInputError(`${problem}\n${USAGE}`);
  let base: string | undefined;
  let candidate: string | undefined;
  const sources: string[] = [];

  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw usage(`${flag} needs a value.`);
    }
    if (flag === '--source') {
      if (sources.includes(value)) throw usage(`Duplicate source ${value}.`);
      sources.push(value);
    } else if (flag === '--base' || flag === '--candidate') {
      if ((flag === '--base' ? base : candidate) !== undefined) {
        throw usage(`${flag} given more than once.`);
      }
      if (flag === '--base') base = value;
      else candidate = value;
    } else {
      throw usage(`Unknown argument ${flag}.`);
    }
  }
  if (base === undefined || candidate === undefined || sources.length < 2) {
    throw usage('Need --base, --candidate and at least two --source values.');
  }
  if (sources.includes(candidate)) {
    throw usage(`The candidate ${candidate} is also a source.`);
  }
  return { base, sources, candidate };
}

export type LockfileReader = {
  isFile(spec: string): boolean;
  readFile(spec: string): string;
  // The commit a revision names, or null when it names none.
  resolveCommit(spec: string): string | null;
  showLockfile(commit: string): string;
};

// A spec is a file path or a git revision. Like git, refuse to guess when it
// is both.
export function readLockfileSpec(spec: string, reader: LockfileReader): string {
  if (spec.startsWith('-')) {
    throw new LockfileUnionInputError(`"${spec}" must not start with "-"`);
  }
  const isFile = reader.isFile(spec);
  const commit = reader.resolveCommit(spec);
  if (isFile && commit) {
    throw new LockfileUnionInputError(
      `"${spec}" is both a file and a git revision; pass ./${spec} for the file or a full ref name for the revision`,
    );
  }
  if (isFile) return reader.readFile(spec);
  if (commit) return reader.showLockfile(commit);
  throw new LockfileUnionInputError(
    `"${spec}" is neither a file nor a git revision`,
  );
}

// Reads revisions with `git rev-parse` and `git show` only: nothing is checked
// out, fetched, or written.
export function gitLockfileReader(options: {
  cwd: string;
  env: NodeJS.ProcessEnv;
}): LockfileReader {
  // Git prefers repository-location variables such as GIT_DIR over the
  // working directory, and git hooks export them. Removing git's own list of
  // repository-local variables keeps every revision in the repository at
  // `cwd`, where file specs resolve too.
  const localVariables = spawnSync('git', ['rev-parse', '--local-env-vars'], {
    env: options.env,
    encoding: 'utf8',
  });
  if (localVariables.status !== 0) {
    throw new Error(
      `git rev-parse --local-env-vars failed: ${localVariables.stderr || localVariables.error}`,
    );
  }
  const env: NodeJS.ProcessEnv = { ...options.env };
  for (const name of localVariables.stdout.split('\n')) delete env[name];
  const git = (args: string[]) =>
    spawnSync('git', args, {
      cwd: options.cwd,
      env,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  const resolve = (spec: string) => path.resolve(options.cwd, spec);
  // A spec that names an unreadable path (a symlink loop, a permission
  // failure) is an input error, not a crash.
  const readInput = <T>(spec: string, read: () => T): T => {
    try {
      return read();
    } catch (error) {
      throw new LockfileUnionInputError(
        `cannot read "${spec}": ${String(error)}`,
        { cause: error },
      );
    }
  };
  return {
    isFile: (spec) =>
      readInput(
        spec,
        () =>
          statSync(resolve(spec), { throwIfNoEntry: false })?.isFile() ?? false,
      ),
    readFile: (spec) =>
      readInput(spec, () => readFileSync(resolve(spec), 'utf8')),
    resolveCommit: (spec) => {
      const result = git([
        'rev-parse',
        '--verify',
        '--quiet',
        `${spec}^{commit}`,
      ]);
      return result.status === 0 ? result.stdout.trim() : null;
    },
    showLockfile: (commit) => {
      const result = git(['show', `${commit}:pnpm-lock.yaml`]);
      if (result.status !== 0) {
        throw new LockfileUnionInputError(
          `cannot read pnpm-lock.yaml at ${commit}: ${result.stderr.trim()}`,
        );
      }
      return result.stdout;
    },
  };
}

export function runVerifyLockfileUnion(
  argv: string[],
  reader: LockfileReader,
  io: { out: (text: string) => void; err: (text: string) => void },
): number {
  try {
    const args = parseLockfileUnionArgs(argv);
    const read = (spec: string): LockfileText => ({
      label: spec,
      text: readLockfileSpec(spec, reader),
    });
    const sources = args.sources.map(read);
    const candidate = read(args.candidate);
    // A candidate identical to one source verifies nothing about the others,
    // which usually means a source was left off the command line.
    const duplicate = sources.find((source) => source.text === candidate.text);
    if (duplicate) {
      throw new LockfileUnionInputError(
        `The candidate ${candidate.label} has the same lockfile as source ${duplicate.label}; a bundle must combine its sources.`,
      );
    }
    const report = compareLockfileUnion({
      base: read(args.base),
      sources,
      candidate,
    });
    io.out(formatLockfileUnionReport(report));
    return lockfileUnionExitCode(report);
  } catch (error) {
    if (!(error instanceof LockfileUnionInputError)) throw error;
    io.err(error.message);
    return LOCKFILE_UNION_EXIT.usage;
  }
}
