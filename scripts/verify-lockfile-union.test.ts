import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import {
  compareLockfileUnion,
  formatLockfileUnionReport,
  LOCKFILE_UNION_EXIT,
  type LockfileReader,
  type LockfileText,
  LockfileUnionInputError,
  lockfileUnionExitCode,
  parseLockfileUnionArgs,
  readLockfileSpec,
  runVerifyLockfileUnion,
} from './verify-lockfile-union';

const FIXTURES = path.join(import.meta.dirname, 'fixtures', 'lockfile-union');

// Modeled on PR #829: three Dependabot sources (#826 Next, #827 Biome,
// #828 Stripe) generated from one base, and a repo-owned bundle.
function fixture(name: string, label = name): LockfileText {
  return {
    label,
    text: readFileSync(path.join(FIXTURES, `${name}.yaml`), 'utf8'),
  };
}

const base = fixture('base');
const source826 = fixture('source-826', '#826');
const source827 = fixture('source-827', '#827');
const source828 = fixture('source-828', '#828');
const sources = [source826, source827, source828];

type Importer = Record<string, unknown>;
type Lockfile = {
  overrides: Record<string, string>;
  importers: { '.': Importer; [path: string]: Importer };
  packages: Record<string, unknown>;
  snapshots: Record<string, unknown>;
  [key: string]: unknown;
};

// Derives a structurally edited variant of a fixture for one scenario.
function variant(
  from: LockfileText,
  label: string,
  edit: (lockfile: Lockfile) => void,
): LockfileText {
  const lockfile: Lockfile = parse(from.text);
  edit(lockfile);
  return { label, text: stringify(lockfile) };
}

function compareWithCandidate(candidate: LockfileText, from = sources) {
  return compareLockfileUnion({ base, sources: from, candidate });
}

function entries(findings: { entry: string }[]) {
  return findings.map((finding) => finding.entry).sort();
}

describe('compareLockfileUnion', () => {
  it('passes the #829 bundle that is exactly the source union', () => {
    const report = compareWithCandidate(fixture('candidate-union'));

    expect(lockfileUnionExitCode(report)).toBe(0);
    expect(report.extra).toEqual([]);
    expect(report.missing).toEqual([]);
    expect(report.unmatched).toEqual([]);
    expect(report.conflicts).toEqual([]);
  });

  it('counts changed entries per source, union and candidate in each section', () => {
    const report = compareWithCandidate(fixture('candidate-union'));

    expect(report.sections.importers).toMatchObject({
      sources: [1, 1, 1],
      union: 3,
      candidate: 3,
      unionKeyDeltas: 0,
      candidateKeyDeltas: 0,
    });
    // Additions and removals: each bump replaces its package and snapshot keys.
    expect(report.sections.packages).toMatchObject({
      sources: [4, 2, 2],
      union: 8,
      candidate: 8,
      unionKeyDeltas: 8,
      candidateKeyDeltas: 8,
    });
    expect(report.sections.snapshots).toMatchObject({
      sources: [4, 2, 2],
      union: 8,
      candidate: 8,
    });
    expect(report.sections.metadata).toMatchObject({
      sources: [0, 0, 0],
      union: 0,
      candidate: 0,
    });
  });

  it('fails the bundle when a newly eligible 2.11.15 transitive replaces the source 2.11.14', () => {
    const report = compareWithCandidate(fixture('candidate-newer-transitive'));

    expect(entries(report.extra)).toEqual([
      'packages > baseline-browser-mapping@2.11.15',
      'snapshots > baseline-browser-mapping@2.11.15',
    ]);
    expect(entries(report.missing)).toEqual([
      'packages > baseline-browser-mapping@2.11.14',
      'snapshots > baseline-browser-mapping@2.11.14',
    ]);
    expect(entries(report.unmatched)).toEqual([
      'snapshots > next@16.3.1(react@19.2.8)',
    ]);
    expect(report.missing[0]?.detail).toBe('#826 adds');
    expect(lockfileUnionExitCode(report)).toBe(
      LOCKFILE_UNION_EXIT.extra |
        LOCKFILE_UNION_EXIT.missing |
        LOCKFILE_UNION_EXIT.unmatched,
    );
  });

  it('reports a candidate addition no source made as extra only', () => {
    const candidate = variant(fixture('candidate-union'), 'extra', (lock) => {
      lock.packages['left-pad@1.3.0'] = {
        resolution: { integrity: 'sha512-left-pad' },
      };
    });

    const report = compareWithCandidate(candidate);

    expect(entries(report.extra)).toEqual(['packages > left-pad@1.3.0']);
    expect(report.extra[0]?.detail).toBe('candidate adds');
    expect(lockfileUnionExitCode(report)).toBe(LOCKFILE_UNION_EXIT.extra);
  });

  it('reports source changes the candidate omits as missing only', () => {
    // The bundle forgot #827's Biome bump entirely.
    const baseLockfile: Lockfile = parse(base.text);
    const candidate = variant(fixture('candidate-union'), 'missing', (lock) => {
      lock.importers['.'].devDependencies =
        baseLockfile.importers['.'].devDependencies;
      for (const section of ['packages', 'snapshots'] as const) {
        delete lock[section]['@biomejs/biome@2.5.8'];
        lock[section]['@biomejs/biome@2.5.7'] =
          baseLockfile[section]['@biomejs/biome@2.5.7'];
      }
    });

    const report = compareWithCandidate(candidate);

    expect(entries(report.missing)).toEqual([
      'importers > . > devDependencies > @biomejs/biome',
      'packages > @biomejs/biome@2.5.7',
      'packages > @biomejs/biome@2.5.8',
      'snapshots > @biomejs/biome@2.5.7',
      'snapshots > @biomejs/biome@2.5.8',
    ]);
    expect(lockfileUnionExitCode(report)).toBe(LOCKFILE_UNION_EXIT.missing);
  });

  it('reports a changed value that matches no source as unmatched only', () => {
    const candidate = variant(
      fixture('candidate-union'),
      'unmatched',
      (lock) => {
        lock.packages['stripe@22.5.0'] = {
          resolution: { integrity: 'sha512-tampered' },
          engines: { node: '>=18' },
        };
      },
    );

    const report = compareWithCandidate(candidate);

    expect(entries(report.unmatched)).toEqual(['packages > stripe@22.5.0']);
    expect(report.unmatched[0]?.detail).toBe(
      'candidate value differs from #828',
    );
    expect(lockfileUnionExitCode(report)).toBe(LOCKFILE_UNION_EXIT.unmatched);
  });

  it('reports sources that change the same metadata differently as a conflict only', () => {
    const conflicting = [
      variant(source826, '#826', (lock) => {
        lock.overrides.postcss = '8.5.24';
      }),
      source827,
      variant(source828, '#828', (lock) => {
        lock.overrides.postcss = '8.5.25';
      }),
    ];
    const candidate = variant(fixture('candidate-union'), 'bundle', (lock) => {
      lock.overrides.postcss = '8.5.24';
    });

    const report = compareWithCandidate(candidate, conflicting);

    expect(report.conflicts).toEqual([
      {
        section: 'metadata',
        entry: 'overrides > postcss',
        detail:
          '#826 changes it to "8.5.24"; #828 changes it to "8.5.25"; candidate takes #826',
      },
    ]);
    expect(report.sections.metadata).toMatchObject({
      sources: [1, 0, 1],
      union: 1,
      conflicts: 1,
    });
    expect(lockfileUnionExitCode(report)).toBe(LOCKFILE_UNION_EXIT.conflict);
  });

  it.each([
    ['keeps the base value', '8.5.23', 'candidate keeps the base value'],
    ['takes a third value', '8.5.26', 'candidate value matches no source'],
  ])(
    'names the outcome when a conflicted candidate %s',
    (_name, candidateValue, outcome) => {
      const conflicting = [
        variant(source826, '#826', (lock) => {
          lock.overrides.postcss = '8.5.24';
        }),
        source827,
        variant(source828, '#828', (lock) => {
          lock.overrides.postcss = '8.5.25';
        }),
      ];
      const candidate = variant(
        fixture('candidate-union'),
        'bundle',
        (lock) => {
          lock.overrides.postcss = candidateValue;
        },
      );

      const report = compareWithCandidate(candidate, conflicting);

      expect(report.conflicts.map(({ detail }) => detail)).toEqual([
        `#826 changes it to "8.5.24"; #828 changes it to "8.5.25"; ${outcome}`,
      ]);
      expect(report.missing).toEqual([]);
      expect(report.unmatched).toEqual([]);
      expect(lockfileUnionExitCode(report)).toBe(LOCKFILE_UNION_EXIT.conflict);
    },
  );

  it('reports one source removing an entry another source changes as a conflict', () => {
    const conflicting = [
      source826,
      variant(source827, '#827', (lock) => {
        lock.snapshots['next@16.3.0(react@19.2.8)'] = {
          dependencies: {
            'baseline-browser-mapping': '2.11.13',
            react: '19.2.8',
            'styled-jsx': '5.1.6',
          },
        };
      }),
      source828,
    ];

    const report = compareWithCandidate(
      fixture('candidate-union'),
      conflicting,
    );

    expect(report.conflicts).toEqual([
      {
        section: 'snapshots',
        entry: 'snapshots > next@16.3.0(react@19.2.8)',
        detail: expect.stringMatching(
          /^#826 removes it; #827 changes it to .+; candidate takes #826$/,
        ),
      },
    ]);
    expect(lockfileUnionExitCode(report)).toBe(LOCKFILE_UNION_EXIT.conflict);
  });

  it('accepts overlapping source changes that agree', () => {
    const overlapping = [
      ...sources,
      variant(base, '#830', (lock) => {
        lock.importers['.'].dependencies = parse(source828.text).importers[
          '.'
        ].dependencies;
      }),
    ];

    const report = compareWithCandidate(
      fixture('candidate-union'),
      overlapping,
    );

    expect(report.sections.importers.sources).toEqual([1, 1, 1, 1]);
    expect(report.sections.importers.union).toBe(3);
    expect(lockfileUnionExitCode(report)).toBe(0);
  });

  it('compares workspace importers and importer-level fields', () => {
    const candidate = variant(
      fixture('candidate-union'),
      'workspace',
      (lock) => {
        lock.importers['packages/docs'] = {
          devDependencies: {
            typescript: { specifier: '^7.0.2', version: '7.0.2' },
          },
          publishDirectory: { dist: true },
        };
      },
    );

    const report = compareWithCandidate(candidate);

    expect(entries(report.extra)).toEqual([
      'importers > packages/docs',
      'importers > packages/docs > devDependencies > typescript',
      'importers > packages/docs > publishDirectory',
    ]);
    expect(report.sections.importers.candidateKeyDeltas).toBe(3);
  });

  it('reports an empty workspace importer the candidate adds as extra', () => {
    const candidate = variant(fixture('candidate-union'), 'empty', (lock) => {
      lock.importers['packages/extra'] = {};
    });

    const report = compareWithCandidate(candidate);

    expect(report.extra).toEqual([
      {
        section: 'importers',
        entry: 'importers > packages/extra',
        detail: 'candidate adds',
      },
    ]);
    expect(lockfileUnionExitCode(report)).toBe(LOCKFILE_UNION_EXIT.extra);
  });

  it('reports an empty workspace importer a source adds and the candidate omits as missing', () => {
    const addingSource = variant(source827, '#827', (lock) => {
      lock.importers['packages/extra'] = {};
    });

    const report = compareWithCandidate(fixture('candidate-union'), [
      source826,
      addingSource,
      source828,
    ]);

    expect(report.missing).toEqual([
      {
        section: 'importers',
        entry: 'importers > packages/extra',
        detail: '#827 adds',
      },
    ]);
    expect(lockfileUnionExitCode(report)).toBe(LOCKFILE_UNION_EXIT.missing);
  });

  it('reports an empty workspace importer a source removes and the candidate keeps as missing', () => {
    const withImporter = (from: LockfileText, label: string) =>
      variant(from, label, (lock) => {
        lock.importers['packages/old'] = {};
      });

    const report = compareLockfileUnion({
      base: withImporter(base, 'base'),
      sources: [
        withImporter(source826, '#826'),
        source827,
        withImporter(source828, '#828'),
      ],
      candidate: withImporter(fixture('candidate-union'), 'bundle'),
    });

    expect(report.missing).toEqual([
      {
        section: 'importers',
        entry: 'importers > packages/old',
        detail: '#827 removes',
      },
    ]);
    expect(lockfileUnionExitCode(report)).toBe(LOCKFILE_UNION_EXIT.missing);
  });

  it('compares scalar top-level metadata such as lockfileVersion', () => {
    const candidate = variant(fixture('candidate-union'), 'v10', (lock) => {
      lock.lockfileVersion = '10.0';
    });

    const report = compareWithCandidate(candidate);

    expect(report.extra).toEqual([
      {
        section: 'metadata',
        entry: 'lockfileVersion',
        detail: 'candidate changes',
      },
    ]);
  });

  it('compares parsed structure rather than text layout', () => {
    // Same data, with every mapping's keys reversed at every depth, plus
    // different quoting and flow style.
    const reverseKeys = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(reverseKeys)
        : typeof value === 'object' && value !== null
          ? Object.fromEntries(
              Object.entries(value)
                .reverse()
                .map(([key, nested]) => [key, reverseKeys(nested)]),
            )
          : value;
    const reordered = reverseKeys(parse(fixture('candidate-union').text));
    const candidate = {
      label: 'reformatted',
      text: stringify(reordered, {
        defaultStringType: 'QUOTE_DOUBLE',
        collectionStyle: 'flow',
      }),
    };

    const report = compareWithCandidate(candidate);

    expect(lockfileUnionExitCode(report)).toBe(0);
  });

  it.each([
    ['invalid YAML', 'lockfileVersion: [unclosed', /candidate: invalid YAML/],
    ['a non-lockfile document', 'name: not-a-lockfile\n', /no lockfileVersion/],
    [
      'a non-mapping section',
      "lockfileVersion: '9.0'\npackages: [a, b]\n",
      /packages must be a mapping/,
    ],
    [
      'a non-mapping importer',
      "lockfileVersion: '9.0'\nimporters:\n  .: 3\n",
      /importer "\." must be a mapping/,
    ],
    [
      'a non-mapping dependency field',
      "lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies: [x]\n",
      /importer "\." dependencies must be a mapping/,
    ],
    [
      'duplicate keys',
      "lockfileVersion: '9.0'\nlockfileVersion: '9.0'\n",
      /candidate: invalid YAML/,
    ],
    [
      'an anchor and alias',
      "lockfileVersion: '9.0'\nsettings: &s {a: 1}\noverrides: *s\n",
      /anchors and aliases are not allowed/,
    ],
    [
      'an anchor without an alias',
      "lockfileVersion: '9.0'\nsettings: &s {a: 1}\n",
      /anchors and aliases are not allowed/,
    ],
    [
      'a cyclic alias',
      "lockfileVersion: '9.0'\npackages: {a: &p {self: *p}}\n",
      /anchors and aliases are not allowed/,
    ],
  ])('rejects %s as an input error', (_name, text, message) => {
    const act = () => compareWithCandidate({ label: 'candidate', text });

    expect(act).toThrow(LockfileUnionInputError);
    expect(act).toThrow(message);
  });
});

describe('formatLockfileUnionReport', () => {
  it('prints a PR-ready table and a passing verdict', () => {
    const output = formatLockfileUnionReport(
      compareWithCandidate(fixture('candidate-union', 'refs/pr/829')),
    );

    expect(output).toContain(
      'Base: `base`. Sources: `#826`, `#827`, `#828`. Candidate: `refs/pr/829`.',
    );
    expect(output).toContain(
      '| packages | 4 / 2 / 2 | 8 | 8 | 8 / 8 | 0 | 0 | 0 | 0 |',
    );
    expect(output).toContain(
      'PASS: the candidate changes exactly the union of the source changes.',
    );
  });

  it('lists each failing category with its exit code', () => {
    const output = formatLockfileUnionReport(
      compareWithCandidate(fixture('candidate-newer-transitive')),
    );

    expect(output).toContain(
      'FAIL (exit 28): 2 extra, 2 missing, 1 unmatched.',
    );
    expect(output).toContain(
      '- `packages > baseline-browser-mapping@2.11.15`: candidate adds',
    );
    expect(output).toContain(
      '- `snapshots > next@16.3.1(react@19.2.8)`: candidate value differs from #826',
    );
  });

  it('caps long finding lists', () => {
    const candidate = variant(fixture('candidate-union'), 'many', (lock) => {
      for (let index = 0; index < 25; index += 1) {
        lock.packages[`extra-${index}@1.0.0`] = {};
      }
    });

    const output = formatLockfileUnionReport(compareWithCandidate(candidate));

    expect(output).toContain('- …and 5 more');
  });
});

describe('parseLockfileUnionArgs', () => {
  it('reads one base, repeated sources and one candidate', () => {
    expect(
      parseLockfileUnionArgs([
        '--base',
        'refs/pr/826^',
        '--source',
        'refs/pr/826',
        '--source',
        'refs/pr/827',
        '--candidate',
        'pnpm-lock.yaml',
      ]),
    ).toEqual({
      base: 'refs/pr/826^',
      sources: ['refs/pr/826', 'refs/pr/827'],
      candidate: 'pnpm-lock.yaml',
    });
  });

  it.each([
    ['no arguments', []],
    ['one source', ['--base', 'b', '--source', 's', '--candidate', 'c']],
    [
      'a duplicate source',
      ['--base', 'b', '--source', 's', '--source', 's', '--candidate', 'c'],
    ],
    [
      'a repeated base',
      [
        '--base',
        'b',
        '--base',
        'b2',
        '--source',
        's1',
        '--source',
        's2',
        '--candidate',
        'c',
      ],
    ],
    [
      'a missing value',
      ['--base', 'b', '--source', 's1', '--source', 's2', '--candidate'],
    ],
    [
      'a flag as a value',
      ['--base', '--source', '--source', 's2', '--candidate', 'c'],
    ],
    [
      'a trailing flag without a value',
      [
        '--base',
        'b',
        '--source',
        's1',
        '--source',
        's2',
        '--candidate',
        'c',
        '--fix',
      ],
    ],
  ])('rejects %s', (_name, argv) => {
    expect(() => parseLockfileUnionArgs(argv)).toThrowError(
      /Usage: tsx scripts\/verify-lockfile-union\.ts/,
    );
  });

  it('rejects an unknown flag even when it has a value', () => {
    expect(() =>
      parseLockfileUnionArgs([
        '--fix',
        'yes',
        '--base',
        'b',
        '--source',
        's1',
        '--source',
        's2',
        '--candidate',
        'c',
      ]),
    ).toThrowError(/Unknown argument --fix\./);
  });
});

describe('readLockfileSpec', () => {
  function reader(
    files: Record<string, string>,
    commits: Record<string, string>,
  ) {
    const shown: string[] = [];
    const lockfileReader: LockfileReader = {
      isFile: (spec) => spec in files,
      readFile: (spec) => files[spec] ?? '',
      resolveCommit: (spec) => commits[spec] ?? null,
      showLockfile: (commit) => {
        shown.push(commit);
        return `lockfile at ${commit}`;
      },
    };
    return { lockfileReader, shown };
  }

  it('reads a file path from disk', () => {
    const { lockfileReader } = reader({ 'pnpm-lock.yaml': 'on disk' }, {});

    expect(readLockfileSpec('pnpm-lock.yaml', lockfileReader)).toBe('on disk');
  });

  it('reads a revision through its resolved commit', () => {
    const { lockfileReader, shown } = reader({}, { 'refs/pr/826': 'abc123' });

    expect(readLockfileSpec('refs/pr/826', lockfileReader)).toBe(
      'lockfile at abc123',
    );
    expect(shown).toEqual(['abc123']);
  });

  it.each([
    ['is both a file and a revision', { dev: 'x' }, { dev: 'abc' }, 'dev'],
    ['is neither a file nor a revision', {}, {}, 'nope'],
    ['starts with a dash', {}, {}, '-p'],
  ])('rejects a spec that %s', (_name, files, commits, spec) => {
    const { lockfileReader } = reader(files, commits);

    expect(() => readLockfileSpec(spec, lockfileReader)).toThrow(
      LockfileUnionInputError,
    );
  });
});

describe('runVerifyLockfileUnion', () => {
  it('rethrows an unexpected reader failure instead of reporting a usage error', () => {
    const failingReader: LockfileReader = {
      isFile: () => {
        throw new Error('disk unavailable');
      },
      readFile: () => '',
      resolveCommit: () => null,
      showLockfile: () => '',
    };

    expect(() =>
      runVerifyLockfileUnion(
        ['--base', 'b', '--source', 's1', '--source', 's2', '--candidate', 'c'],
        failingReader,
        { out: () => undefined, err: () => undefined },
      ),
    ).toThrow('disk unavailable');
  });
});
