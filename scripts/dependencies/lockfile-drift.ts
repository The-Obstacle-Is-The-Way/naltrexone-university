import {
  type LockfileReader,
  type LockfileText,
  LockfileUnionInputError,
  parseLockfile,
  readLockfileSpec,
} from './lockfile-union';

// Checks one update added to a dependency bundle beyond its Dependabot
// sources ("Updates added beyond the sources" in
// docs/guides/dependencies/updating-dependencies.md). Outside the packages the
// update names, it fails on drift:
// - a new copy beside another copy on the same caret line;
// - an entry the parent had moving onto a copy the parent lacked, onto one
//   whose old copy stays in use, or onto an older version.
// It reads `packages` keys and every importer's and snapshot entry's
// dependency maps, nothing else. A change inside a `packages` entry, to
// `overrides` or `settings`, or to a tarball or git value goes unseen here;
// the diffs of pnpm-workspace.yaml and package.json show the configuration.
// A copy a consumer's declared range requires passes only through an
// allowance naming that consumer, quoted in the pull request. It reads
// lockfiles and never writes one. The CLI is
// scripts/dependencies/verify-lockfile-drift.ts.

const USAGE =
  'Usage: node --import tsx scripts/dependencies/verify-lockfile-drift.ts --parent <rev|file> --candidate <rev|file> --update <name>[@<major>] [--update ...] [--allow <consumer>><name>@<version> ...]';

export const LOCKFILE_DRIFT_EXIT = {
  usage: 2,
  drift: 4,
  unused: 8,
} as const;

export type DriftMove = {
  consumer: string;
  // The copies the consumer used in the parent; empty for a new dependency.
  from: string[];
  fromStaysInUse: boolean;
  downgrade: boolean;
};
export type DriftFinding = {
  copy: string;
  // Other copies on the same caret line beside a new copy; empty otherwise.
  besides: string[];
  // Entries the parent lacked that use the copy.
  users: string[];
  // Entries the parent had that moved onto the copy.
  moves: DriftMove[];
};
export type LockfileDriftReport = {
  labels: { parent: string; candidate: string };
  updates: string[];
  allowed: string[];
  // The findings' copies the parent lacked.
  newCopies: Set<string>;
  findings: DriftFinding[];
  unusedAllowances: string[];
  unusedUpdates: string[];
};

type Mapping = Record<string, unknown>;
// Dependency name -> the copies it resolves to.
type Dependencies = Map<string, Set<string>>;
type Lockfile = {
  copies: Set<string>;
  // Entries by full key: a snapshot key with its peer suffix, or
  // `importer <path>`.
  entries: Map<string, Dependencies>;
};
type Update = { spec: string; name: string; major?: string };

const IMPORTER_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
];
const SNAPSHOT_FIELDS = ['dependencies', 'optionalDependencies'];
const IMPORTER_PREFIX = 'importer ';
const NAME = '(?:@[^/@>]+/)?[^/@>]+';
const UPDATE_PATTERN = new RegExp(`^${NAME}(?:@\\d+)?$`);
const ALLOWANCE_PATTERN = new RegExp(`^[^>]+>${NAME}@[^@>]+$`);
const ALIAS_PATTERN = new RegExp(`^${NAME}@\\d[^:]*$`);
const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([^+]+))?(?:\+.*)?$/;

function isMapping(value: unknown): value is Mapping {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function withoutPeers(spec: string): string {
  return spec.replace(/\(.*$/s, '');
}

// An entry's key without the peer suffix that only snapshot keys carry. An
// importer's path is kept whole, parentheses included.
function entryIdentity(key: string): string {
  return key.startsWith(IMPORTER_PREFIX) ? key : withoutPeers(key);
}

// A `name@version` copy's parts; names may be scoped.
function packageName(copy: string): string {
  return copy.slice(0, copy.lastIndexOf('@'));
}
function versionOf(copy: string): string {
  return copy.slice(copy.lastIndexOf('@') + 1);
}

function parseVersion(version: string) {
  const match = VERSION_PATTERN.exec(version);
  if (!match) return undefined;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? '',
  };
}

// Negative when `a` is older than `b`, and undefined when either is not
// semver, which the check then treats as older.
function compareVersions(a: string, b: string): number | undefined {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return undefined;
  const core = x.major - y.major || x.minor - y.minor || x.patch - y.patch;
  if (core !== 0 || x.prerelease === y.prerelease) return core;
  // A prerelease comes before its release.
  if (!x.prerelease) return 1;
  if (!y.prerelease) return -1;
  return comparePrereleases(x.prerelease, y.prerelease);
}

// SemVer's prerelease order, for two different prereleases: identifier by
// identifier, numbers by value and before words, and a shorter list first
// when the longer one starts with it.
function comparePrereleases(a: string, b: string): number {
  const x = a.split('.');
  const y = b.split('.');
  for (let index = 0; ; index += 1) {
    const p = x[index];
    const q = y[index];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (p === q) continue;
    const pNumber = /^\d+$/.test(p);
    const qNumber = /^\d+$/.test(q);
    if (pNumber && qNumber) return Number(p) - Number(q);
    if (pNumber !== qNumber) return pNumber ? -1 : 1;
    return p < q ? -1 : 1;
  }
}

// The versions one caret range can span: the major, or for 0.x the minor.
function caretLine(copy: string): string {
  const parsed = parseVersion(versionOf(copy));
  if (!parsed) return copy;
  const { major, minor, patch } = parsed;
  const line =
    major > 0 ? `${major}` : minor > 0 ? `0.${minor}` : `0.0.${patch}`;
  return `${packageName(copy)}@${line}`;
}

// The copy a lockfile dependency value resolves to: a version for the
// dependency's own name, or `name@version` for an npm alias. Link, file,
// tarball and git values, and a missing one, have no copy.
function resolvedCopy(name: string, value: unknown): string | undefined {
  const bare = withoutPeers(String(value));
  if (/^\d/.test(bare)) return `${name}@${bare}`;
  return ALIAS_PATTERN.test(bare) ? bare : undefined;
}

function addUse(dependencies: Dependencies, name: string, copy: string) {
  dependencies.set(name, (dependencies.get(name) ?? new Set()).add(copy));
}

// Orders text the way the default sort does, with no branch to cover.
function byText(a: string, b: string): number {
  return Number(a > b) - Number(a < b);
}

function readLockfile(lockfile: LockfileText): Lockfile {
  const document = parseLockfile(lockfile);
  const section = (name: string): Mapping => {
    const value = document[name];
    if (value === undefined || value === null) return {};
    if (!isMapping(value)) {
      throw new LockfileUnionInputError(
        `${lockfile.label}: ${name} must be a mapping`,
      );
    }
    return value;
  };
  const copies = new Set(Object.keys(section('packages')).map(withoutPeers));
  const entries = new Map<string, Dependencies>();
  // Every entry is recorded, even one with no dependencies, so a new entry is
  // never mistaken for one the parent had.
  const record = (key: string, fields: unknown, names: string[]) => {
    const own: Dependencies = new Map();
    entries.set(key, own);
    if (!isMapping(fields)) return;
    for (const field of names) {
      const values = fields[field];
      if (!isMapping(values)) continue;
      for (const [name, value] of Object.entries(values)) {
        const copy = resolvedCopy(
          name,
          isMapping(value) ? value.version : value,
        );
        if (!copy) continue;
        addUse(own, name, copy);
      }
    }
  };
  for (const [importer, fields] of Object.entries(section('importers'))) {
    record(`${IMPORTER_PREFIX}${importer}`, fields, IMPORTER_FIELDS);
  }
  for (const [key, fields] of Object.entries(section('snapshots'))) {
    record(key, fields, SNAPSHOT_FIELDS);
  }
  return { copies, entries };
}

// An update names a package, or one major line of it as `name@<major>`.
function parseUpdate(spec: string): Update {
  const at = spec.lastIndexOf('@');
  const major = at > 0 ? spec.slice(at + 1) : '';
  return /^\d+$/.test(major)
    ? { spec, name: spec.slice(0, at), major }
    : { spec, name: spec };
}

export function compareLockfileDrift(input: {
  parent: LockfileText;
  candidate: LockfileText;
  updates: string[];
  allowed: string[];
}): LockfileDriftReport {
  const parent = readLockfile(input.parent);
  const candidate = readLockfile(input.candidate);
  const updates = input.updates.map(parseUpdate);
  const usedUpdates = new Set<string>();
  // Every update that covers a changed copy counts as used.
  const inScope = (copy: string) => {
    const covering = updates.filter(
      ({ name, major }) =>
        name === packageName(copy) &&
        (major === undefined || versionOf(copy).split('.')[0] === major),
    );
    for (const { spec } of covering) usedUpdates.add(spec);
    return covering.length > 0;
  };
  for (const copy of new Set([...parent.copies, ...candidate.copies])) {
    if (parent.copies.has(copy) !== candidate.copies.has(copy)) inScope(copy);
  }

  // Copy -> the lines beside it, and the moves onto it by consumer.
  const besides = new Map<string, string[]>();
  const moves = new Map<string, Map<string, DriftMove>>();

  // A new copy beside another copy on the same caret line.
  for (const copy of candidate.copies) {
    if (parent.copies.has(copy) || inScope(copy)) continue;
    const others = [...candidate.copies].filter(
      (other) => other !== copy && caretLine(other) === caretLine(copy),
    );
    if (others.length > 0) besides.set(copy, others.sort());
  }

  // An entry keeps its key unless its peers changed. A renamed one succeeds
  // the parent's variants of the same name and version that the candidate
  // no longer has, so it is compared with those, merged; a variant that
  // stays is its own entry, and cannot hide the renamed one's move.
  const gone = new Map<string, Dependencies>();
  for (const [key, dependencies] of parent.entries) {
    if (candidate.entries.has(key)) continue;
    const identity = entryIdentity(key);
    const merged = gone.get(identity) ?? new Map<string, Set<string>>();
    for (const [name, copies] of dependencies) {
      for (const copy of copies) addUse(merged, name, copy);
    }
    gone.set(identity, merged);
  }

  // An entry the parent had that moves onto a copy the parent lacked, onto
  // one whose old copy stays in use, or onto an older version.
  const newEntries = new Map<string, Dependencies>();
  for (const [key, dependencies] of candidate.entries) {
    const identity = entryIdentity(key);
    const before = parent.entries.get(key) ?? gone.get(identity);
    if (!before) {
      // New peer variants of one package report as one user, so merge their
      // dependencies: a variant without the copy must not hide one with it.
      const merged = newEntries.get(identity) ?? new Map<string, Set<string>>();
      for (const [name, copies] of dependencies) {
        for (const copy of copies) addUse(merged, name, copy);
      }
      newEntries.set(identity, merged);
      continue;
    }
    for (const [name, copies] of dependencies) {
      const earlier = [...(before.get(name) ?? [])].sort();
      for (const copy of copies) {
        if (earlier.includes(copy) || inScope(copy)) continue;
        const fromStaysInUse = earlier.some((old) => candidate.copies.has(old));
        const downgrade = earlier.some(
          (old) => (compareVersions(versionOf(copy), versionOf(old)) ?? -1) < 0,
        );
        if (parent.copies.has(copy) && !fromStaysInUse && !downgrade) continue;
        // Peer variants of one entry report as one consumer, so their moves
        // onto the same copy merge rather than replace each other.
        const byConsumer = moves.get(copy) ?? new Map<string, DriftMove>();
        const previous = byConsumer.get(identity) ?? {
          consumer: identity,
          from: [],
          fromStaysInUse: false,
          downgrade: false,
        };
        byConsumer.set(identity, {
          consumer: identity,
          from: [...new Set([...previous.from, ...earlier])].sort(),
          fromStaysInUse: previous.fromStaysInUse || fromStaysInUse,
          downgrade: previous.downgrade || downgrade,
        });
        moves.set(copy, byConsumer);
      }
    }
  }

  const allowed = new Set(input.allowed);
  const usedAllowances = new Set<string>();
  const notAllowed = (copy: string) => (consumer: string) => {
    const allowance = `${consumer}>${copy}`;
    if (allowed.has(allowance)) usedAllowances.add(allowance);
    return !allowed.has(allowance);
  };
  const findings: DriftFinding[] = [];
  for (const copy of [
    ...new Set([...besides.keys(), ...moves.keys()]),
  ].sort()) {
    const byConsumer = moves.get(copy) ?? new Map<string, DriftMove>();
    const users = [...newEntries]
      .filter(([, dependencies]) =>
        [...dependencies.values()].some((copies) => copies.has(copy)),
      )
      .map(([identity]) => identity);
    const consumers = [...users, ...byConsumer.keys()];
    const kept = consumers.filter(notAllowed(copy));
    // A finding stays unless an allowance covers every consumer it had.
    if (consumers.length > 0 && kept.length === 0) continue;
    findings.push({
      copy,
      besides: besides.get(copy) ?? [],
      users: users.filter((user) => kept.includes(user)).sort(),
      moves: [...byConsumer.values()]
        .filter((move) => kept.includes(move.consumer))
        .sort((a, b) => byText(a.consumer, b.consumer)),
    });
  }

  return {
    labels: { parent: input.parent.label, candidate: input.candidate.label },
    updates: input.updates,
    allowed: input.allowed,
    newCopies: new Set(
      findings
        .map(({ copy }) => copy)
        .filter((copy) => !parent.copies.has(copy)),
    ),
    findings,
    unusedAllowances: input.allowed.filter(
      (allowance) => !usedAllowances.has(allowance),
    ),
    unusedUpdates: input.updates.filter((spec) => !usedUpdates.has(spec)),
  };
}

export function lockfileDriftExitCode(report: LockfileDriftReport): number {
  return (
    (report.findings.length > 0 ? LOCKFILE_DRIFT_EXIT.drift : 0) |
    (report.unusedAllowances.length + report.unusedUpdates.length > 0
      ? LOCKFILE_DRIFT_EXIT.unused
      : 0)
  );
}

const code = (text: string) => `\`${text}\``;
const list = (items: string[]) => items.map(code).join(', ');

function describeFinding(
  finding: DriftFinding,
  report: LockfileDriftReport,
): string {
  const parts = [
    !report.newCopies.has(finding.copy)
      ? 'a copy the parent already had.'
      : finding.besides.length > 0
        ? `a new copy beside ${list(finding.besides)}.`
        : 'a new copy.',
  ];
  if (finding.users.length > 0) {
    parts.push(`Used by new entries ${list(finding.users)}.`);
  }
  for (const move of finding.moves) {
    const from =
      move.from.length > 0 ? list(move.from) : 'no earlier dependency';
    const notes = [
      ...(move.fromStaysInUse ? ['which stays in use'] : []),
      ...(move.downgrade ? ['a downgrade'] : []),
    ];
    parts.push(
      `${code(move.consumer)} moved onto it from ${from}${notes.length > 0 ? `, ${notes.join(', ')}` : ''}.`,
    );
  }
  return `- ${code(finding.copy)}: ${parts.join(' ')}`;
}

export function formatLockfileDriftReport(report: LockfileDriftReport): string {
  const lines = [
    '## Lockfile drift check',
    '',
    `Parent: ${code(report.labels.parent)}. Candidate: ${code(report.labels.candidate)}. Updates: ${list(report.updates)}. Allowed: ${report.allowed.length > 0 ? list(report.allowed) : 'none'}.`,
    '',
  ];
  const exitCode = lockfileDriftExitCode(report);
  if (exitCode === 0) {
    // A pass that needed allowances says so.
    const scope =
      report.allowed.length > 0
        ? 'the named updates and the allowances'
        : 'the named updates';
    lines.push(
      `PASS: outside ${scope}, no new copy sits beside another, and no entry the parent had moves onto a new, still-shared or older copy.`,
    );
    return lines.join('\n');
  }

  const problems: string[] = [];
  const { findings, unusedAllowances, unusedUpdates } = report;
  if (findings.length > 0) {
    problems.push(
      `${findings.length} ${findings.length === 1 ? 'copy' : 'copies'} outside the named updates`,
    );
  }
  if (unusedAllowances.length > 0) {
    problems.push(`${list(unusedAllowances)} matches no finding`);
  }
  if (unusedUpdates.length > 0) {
    problems.push(
      `${unusedUpdates.map((spec) => code(`--update ${spec}`)).join(', ')} changes nothing`,
    );
  }
  lines.push(`FAIL (exit ${exitCode}): ${problems.join('; ')}.`);
  if (findings.length > 0) {
    lines.push(
      '',
      ...findings.map((finding) => describeFinding(finding, report)),
      '',
      "Regenerate each copy away under a temporary override, as the guide's drift steps say. Pass `--allow <consumer>><name>@<version>` only where that consumer's declared range requires the copy, and quote the range in the pull request.",
    );
  }
  return lines.join('\n');
}

export function parseLockfileDriftArgs(argv: string[]): {
  parent: string;
  candidate: string;
  updates: string[];
  allowed: string[];
} {
  const usage = (problem: string) =>
    new LockfileUnionInputError(`${problem}\n${USAGE}`);
  let parent: string | undefined;
  let candidate: string | undefined;
  const updates: string[] = [];
  const allowed: string[] = [];

  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      flag !== '--parent' &&
      flag !== '--candidate' &&
      flag !== '--update' &&
      flag !== '--allow'
    ) {
      throw usage(`Unknown argument ${flag}.`);
    }
    if (value === undefined || value.startsWith('--')) {
      throw usage(`${flag} needs a value.`);
    }
    if (flag === '--update') {
      if (updates.includes(value)) throw usage(`Duplicate --update ${value}.`);
      if (!UPDATE_PATTERN.test(value)) {
        throw usage(`--update takes a package name or name@<major>: ${value}.`);
      }
      updates.push(value);
    } else if (flag === '--allow') {
      if (allowed.includes(value)) throw usage(`Duplicate --allow ${value}.`);
      if (!ALLOWANCE_PATTERN.test(value)) {
        throw usage(`--allow takes <consumer>><name>@<version>: ${value}.`);
      }
      allowed.push(value);
    } else {
      if ((flag === '--parent' ? parent : candidate) !== undefined) {
        throw usage(`${flag} given more than once.`);
      }
      if (flag === '--parent') parent = value;
      else candidate = value;
    }
  }
  if (parent === undefined || candidate === undefined || updates.length < 1) {
    throw usage('Need --parent, --candidate and at least one --update.');
  }
  if (parent === candidate) {
    throw usage(`The parent and the candidate are both ${parent}.`);
  }
  return { parent, candidate, updates, allowed };
}

export function runVerifyLockfileDrift(
  argv: string[],
  reader: LockfileReader,
  io: { out: (text: string) => void; err: (text: string) => void },
): number {
  try {
    const args = parseLockfileDriftArgs(argv);
    const read = (spec: string): LockfileText => ({
      label: spec,
      text: readLockfileSpec(spec, reader),
    });
    const report = compareLockfileDrift({
      parent: read(args.parent),
      candidate: read(args.candidate),
      updates: args.updates,
      allowed: args.allowed,
    });
    io.out(formatLockfileDriftReport(report));
    return lockfileDriftExitCode(report);
  } catch (error) {
    if (!(error instanceof LockfileUnionInputError)) throw error;
    io.err(error.message);
    return LOCKFILE_DRIFT_EXIT.usage;
  }
}
