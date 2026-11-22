import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import {
  compareLockfileDrift,
  LOCKFILE_DRIFT_EXIT,
  lockfileDriftExitCode,
} from './lockfile-drift';
import type { LockfileText } from './lockfile-union';

// Dependency name -> the value pnpm writes for it in a snapshot entry.
type Dependencies = Record<string, string>;

// Builds a pnpm 9 lockfile: one root importer, a packages entry for every
// snapshot entry, and the snapshot entries themselves.
function lockfile(
  label: string,
  spec: {
    importer?: Record<string, string>;
    snapshots: Record<string, Dependencies>;
  },
): LockfileText {
  const packages = Object.fromEntries(
    Object.keys(spec.snapshots).map((key) => [
      key.replace(/\(.*$/, ''),
      { resolution: { integrity: 'sha512-fixture' } },
    ]),
  );
  const snapshots = Object.fromEntries(
    Object.entries(spec.snapshots).map(([key, dependencies]) => [
      key,
      Object.keys(dependencies).length > 0 ? { dependencies } : {},
    ]),
  );
  const dependencies = Object.fromEntries(
    Object.entries(spec.importer ?? {}).map(([name, version]) => [
      name,
      { specifier: version.replace(/\(.*$/, ''), version },
    ]),
  );
  return {
    label,
    text: stringify({
      lockfileVersion: '9.0',
      importers: { '.': { dependencies } },
      packages,
      snapshots,
    }),
  };
}

// Modeled on #1702's Vitest update, whose lockfile moved Babel 8 helpers and
// `estree-walker` onto new duplicate copies that nothing required.
const parentSnapshots: Record<string, Dependencies> = {
  'vitest@5.0.3': { '@babel/parser': '8.0.8', tinybench: '2.9.0' },
  '@babel/parser@8.0.8': { '@babel/types': '8.0.8' },
  '@babel/types@8.0.8': {},
  '@babel/helper-a@8.0.0': { '@babel/types': '8.0.8' },
  'estree-walker@3.0.3': { '@types/estree': '1.0.9' },
  '@types/estree-jsx@1.0.5': { '@types/estree': '1.0.9' },
  '@types/estree@1.0.9': {},
  'tinybench@2.9.0': {},
};
const parent = lockfile('parent', {
  importer: { vitest: '5.0.3' },
  snapshots: parentSnapshots,
});

function candidateWith(changes: {
  importer?: Record<string, string>;
  remove?: string[];
  snapshots?: Record<string, Dependencies>;
}): LockfileText {
  const snapshots = { ...parentSnapshots };
  for (const key of changes.remove ?? []) delete snapshots[key];
  return lockfile('candidate', {
    importer: { vitest: '5.0.3', ...changes.importer },
    snapshots: { ...snapshots, ...changes.snapshots },
  });
}

// The clean form of the Vitest update: Vitest and its own new tinybench
// replace their old copies, and nothing else moves.
const cleanVitestUpdate = {
  importer: { vitest: '5.1.0' },
  remove: ['vitest@5.0.3', 'tinybench@2.9.0'],
  snapshots: {
    'vitest@5.1.0': { '@babel/parser': '8.0.8', tinybench: '3.0.0' },
    'tinybench@3.0.0': {},
  },
};

function drift(
  candidate: LockfileText,
  updates: string[],
  allowed: string[] = [],
  from = parent,
) {
  return compareLockfileDrift({ parent: from, candidate, updates, allowed });
}

function copies(report: ReturnType<typeof drift>) {
  return report.findings.map((finding) => finding.copy);
}

describe('compareLockfileDrift', () => {
  it('passes an update whose new copies replace their old ones', () => {
    const report = drift(candidateWith(cleanVitestUpdate), ['vitest']);

    expect(report.findings).toEqual([]);
    expect(lockfileDriftExitCode(report)).toBe(0);
  });

  it('reports a new copy that sits beside an older copy of a package the update does not name', () => {
    const report = drift(
      candidateWith({
        ...cleanVitestUpdate,
        remove: [...cleanVitestUpdate.remove, '@babel/parser@8.0.8'],
        snapshots: {
          ...cleanVitestUpdate.snapshots,
          'vitest@5.1.0': { '@babel/parser': '8.1.0', tinybench: '3.0.0' },
          '@babel/parser@8.1.0': { '@babel/types': '8.1.0' },
          '@babel/types@8.1.0': {},
        },
      }),
      ['vitest'],
    );

    // `@babel/parser` 8.1.0 replaced 8.0.8 outright, so only the
    // `@babel/types` copy beside 8.0.8 is drift.
    expect(report.findings).toEqual([
      {
        copy: '@babel/types@8.1.0',
        besides: ['@babel/types@8.0.8'],
        users: ['@babel/parser@8.1.0'],
        moves: [],
      },
    ]);
    expect(lockfileDriftExitCode(report)).toBe(LOCKFILE_DRIFT_EXIT.drift);
  });

  it('reports an existing entry moved onto a new duplicate copy', () => {
    const report = drift(
      candidateWith({
        ...cleanVitestUpdate,
        snapshots: {
          ...cleanVitestUpdate.snapshots,
          'estree-walker@3.0.3': { '@types/estree': '1.0.10' },
          '@types/estree@1.0.10': {},
        },
      }),
      ['vitest'],
    );

    expect(report.findings).toEqual([
      {
        copy: '@types/estree@1.0.10',
        besides: ['@types/estree@1.0.9'],
        users: [],
        moves: [
          {
            consumer: 'estree-walker@3.0.3',
            from: ['@types/estree@1.0.9'],
            fromStaysInUse: true,
            downgrade: false,
          },
        ],
      },
    ]);
  });

  it('reports an existing entry moved onto a copy the parent lacked, even when the old copy goes', () => {
    const report = drift(
      candidateWith({
        ...cleanVitestUpdate,
        remove: [...cleanVitestUpdate.remove, '@types/estree@1.0.9'],
        snapshots: {
          ...cleanVitestUpdate.snapshots,
          'estree-walker@3.0.3': { '@types/estree': '1.0.10' },
          '@types/estree-jsx@1.0.5': { '@types/estree': '1.0.10' },
          '@types/estree@1.0.10': {},
        },
      }),
      ['vitest'],
    );

    expect(copies(report)).toEqual(['@types/estree@1.0.10']);
    expect(report.findings[0]?.besides).toEqual([]);
    expect(report.findings[0]?.moves.map((move) => move.consumer)).toEqual([
      '@types/estree-jsx@1.0.5',
      'estree-walker@3.0.3',
    ]);
  });

  it('reports a move onto a copy the parent had when the old copy stays in use', () => {
    const withBoth = lockfile('parent', {
      importer: { vitest: '5.0.3' },
      snapshots: {
        ...parentSnapshots,
        'acorn-walk@8.3.4': { '@types/estree': '1.0.10' },
        '@types/estree@1.0.10': {},
      },
    });
    const report = drift(
      lockfile('candidate', {
        importer: { vitest: '5.0.3' },
        snapshots: {
          ...parentSnapshots,
          'acorn-walk@8.3.4': { '@types/estree': '1.0.10' },
          '@types/estree@1.0.10': {},
          'estree-walker@3.0.3': { '@types/estree': '1.0.10' },
        },
      }),
      ['vitest'],
      [],
      withBoth,
    );

    expect(report.findings).toEqual([
      {
        copy: '@types/estree@1.0.10',
        besides: [],
        users: [],
        moves: [
          {
            consumer: 'estree-walker@3.0.3',
            from: ['@types/estree@1.0.9'],
            fromStaysInUse: true,
            downgrade: false,
          },
        ],
      },
    ]);
  });

  it('passes a move onto a copy the parent had when the old copy goes', () => {
    const withBoth = lockfile('parent', {
      importer: { vitest: '5.0.3' },
      snapshots: {
        ...parentSnapshots,
        'acorn-walk@8.3.4': { '@types/estree': '1.0.10' },
        '@types/estree@1.0.10': {},
      },
    });
    const deduplicated = { ...parentSnapshots };
    delete deduplicated['@types/estree@1.0.9'];
    const report = drift(
      lockfile('candidate', {
        importer: { vitest: '5.0.3' },
        snapshots: {
          ...deduplicated,
          'acorn-walk@8.3.4': { '@types/estree': '1.0.10' },
          '@types/estree@1.0.10': {},
          'estree-walker@3.0.3': { '@types/estree': '1.0.10' },
          '@types/estree-jsx@1.0.5': { '@types/estree': '1.0.10' },
        },
      }),
      ['vitest'],
      [],
      withBoth,
    );

    expect(report.findings).toEqual([]);
  });

  it('allows the named packages new copies, even beside older ones', () => {
    const report = drift(
      candidateWith({
        snapshots: {
          '@babel/helper-b@8.1.0': { '@babel/types': '8.1.0' },
          '@babel/types@8.1.0': {},
          '@babel/parser@8.0.8': { '@babel/types': '8.1.0' },
        },
      }),
      ['@babel/types', '@babel/helper-b'],
    );

    expect(report.findings).toEqual([]);
  });

  it('passes a peer-suffix rename whose peer is the named update', () => {
    const peerParent = lockfile('parent', {
      importer: { '@types/node': '24.13.4', stripe: '22.5.0' },
      snapshots: {
        'stripe@22.5.0(@types/node@24.13.4)': { '@types/node': '24.13.4' },
        '@types/node@24.13.4': {},
      },
    });
    const renamed = lockfile('candidate', {
      importer: { '@types/node': '24.13.5', stripe: '22.5.0' },
      snapshots: {
        'stripe@22.5.0(@types/node@24.13.5)': { '@types/node': '24.13.5' },
        '@types/node@24.13.5': {},
      },
    });

    expect(drift(renamed, ['@types/node'], [], peerParent).findings).toEqual(
      [],
    );
    // Named differently, the same lockfile moves an existing entry and the
    // root importer onto a copy the parent lacked.
    expect(
      drift(renamed, ['stripe'], [], peerParent).findings[0]?.moves,
    ).toEqual([
      {
        consumer: 'importer .',
        from: ['@types/node@24.13.4'],
        fromStaysInUse: false,
        downgrade: false,
      },
      {
        consumer: 'stripe@22.5.0',
        from: ['@types/node@24.13.4'],
        fromStaysInUse: false,
        downgrade: false,
      },
    ]);
  });

  it('resolves an npm alias to the package it installs', () => {
    const aliasParent = lockfile('parent', {
      snapshots: {
        'tool@1.0.0': { '@typescript/old': 'typescript@6.0.3' },
        'other@1.0.0': { typescript: '6.0.3' },
        'typescript@6.0.3': {},
      },
    });
    const aliasCandidate = lockfile('candidate', {
      snapshots: {
        'tool@1.0.0': { '@typescript/old': 'typescript@6.0.4' },
        'other@1.0.0': { typescript: '6.0.3' },
        'typescript@6.0.3': {},
        'typescript@6.0.4': {},
      },
    });

    // The move is reported only if the alias resolves to `typescript`.
    expect(drift(aliasCandidate, ['tool'], [], aliasParent).findings).toEqual([
      {
        copy: 'typescript@6.0.4',
        besides: ['typescript@6.0.3'],
        users: [],
        moves: [
          {
            consumer: 'tool@1.0.0',
            from: ['typescript@6.0.3'],
            fromStaysInUse: true,
            downgrade: false,
          },
        ],
      },
    ]);
    expect(
      drift(aliasCandidate, ['typescript'], [], aliasParent).findings,
    ).toEqual([]);
  });

  it('ignores link and file dependencies', () => {
    const linkParent = lockfile('parent', {
      snapshots: { 'tool@1.0.0': { local: 'link:../local' } },
    });
    const report = drift(
      lockfile('candidate', {
        snapshots: { 'tool@1.0.0': { local: 'file:../local' } },
      }),
      ['tool'],
      [],
      linkParent,
    );

    expect(report.findings).toEqual([]);
  });

  it('drops only the consumers an allowance names, and reports one that matches nothing', () => {
    // The named update's new `tool` needs a new `foo` 1.1.0, but an unrelated
    // entry `y` also moves onto it while `x` keeps 1.0.0.
    const toolParent = lockfile('parent', {
      snapshots: {
        'tool@1.0.0': { foo: '1.0.0' },
        'x@1.0.0': { foo: '1.0.0' },
        'y@1.0.0': { foo: '1.0.0' },
        'foo@1.0.0': {},
      },
    });
    const toolCandidate = lockfile('candidate', {
      snapshots: {
        'tool@1.1.0': { foo: '1.1.0' },
        'x@1.0.0': { foo: '1.0.0' },
        'y@1.0.0': { foo: '1.1.0' },
        'foo@1.0.0': {},
        'foo@1.1.0': {},
      },
    });

    const partly = drift(
      toolCandidate,
      ['tool'],
      ['tool@1.1.0>foo@1.1.0'],
      toolParent,
    );
    expect(partly.findings).toEqual([
      {
        copy: 'foo@1.1.0',
        besides: ['foo@1.0.0'],
        users: [],
        moves: [
          {
            consumer: 'y@1.0.0',
            from: ['foo@1.0.0'],
            fromStaysInUse: true,
            downgrade: false,
          },
        ],
      },
    ]);

    const fully = drift(
      toolCandidate,
      ['tool'],
      ['tool@1.1.0>foo@1.1.0', 'y@1.0.0>foo@1.1.0'],
      toolParent,
    );
    expect(fully.findings).toEqual([]);
    expect(lockfileDriftExitCode(fully)).toBe(0);

    const stale = drift(
      toolCandidate,
      ['tool'],
      ['tool@1.1.0>foo@1.1.0', 'y@1.0.0>foo@1.1.0', 'x@1.0.0>foo@1.1.0'],
      toolParent,
    );
    expect(stale.unusedAllowances).toEqual(['x@1.0.0>foo@1.1.0']);
    expect(lockfileDriftExitCode(stale)).toBe(LOCKFILE_DRIFT_EXIT.unused);
  });

  it('reports a move onto an older copy, even when it leaves the newer one unused', () => {
    const versionsParent = lockfile('parent', {
      snapshots: {
        'a@1.0.0': { util: '2.0.0' },
        'b@1.0.0': { util: '1.0.0' },
        'util@1.0.0': {},
        'util@2.0.0': {},
      },
    });
    const downgraded = lockfile('candidate', {
      snapshots: {
        'a@1.0.0': { util: '1.0.0' },
        'b@1.0.0': { util: '1.0.0' },
        'util@1.0.0': {},
      },
    });

    expect(drift(downgraded, ['b'], [], versionsParent).findings).toEqual([
      {
        copy: 'util@1.0.0',
        besides: [],
        users: [],
        moves: [
          {
            consumer: 'a@1.0.0',
            from: ['util@2.0.0'],
            fromStaysInUse: false,
            downgrade: true,
          },
        ],
      },
    ]);
  });

  it('compares each peer variant of an entry on its own', () => {
    const variantsParent = lockfile('parent', {
      snapshots: {
        'lib@1.0.0(react@18.0.0)': { util: '1.0.0', react: '18.0.0' },
        'lib@1.0.0(react@19.0.0)': { util: '1.1.0', react: '19.0.0' },
        'other@1.0.0': { util: '1.0.0' },
        'util@1.0.0': {},
        'util@1.1.0': {},
        'react@18.0.0': {},
        'react@19.0.0': {},
      },
    });
    const moved = lockfile('candidate', {
      snapshots: {
        'lib@1.0.0(react@18.0.0)': { util: '1.1.0', react: '18.0.0' },
        'lib@1.0.0(react@19.0.0)': { util: '1.1.0', react: '19.0.0' },
        'other@1.0.0': { util: '1.0.0' },
        'util@1.0.0': {},
        'util@1.1.0': {},
        'react@18.0.0': {},
        'react@19.0.0': {},
      },
    });

    expect(drift(moved, ['react'], [], variantsParent).findings).toEqual([
      {
        copy: 'util@1.1.0',
        besides: [],
        users: [],
        moves: [
          {
            consumer: 'lib@1.0.0',
            from: ['util@1.0.0'],
            fromStaysInUse: true,
            downgrade: false,
          },
        ],
      },
    ]);
  });

  it('compares a renamed entry with the variants that went, not those that stayed', () => {
    const variantsParent = lockfile('parent', {
      snapshots: {
        'lib@1.0.0(react@18.0.0)': { util: '1.0.0', react: '18.0.0' },
        'lib@1.0.0(react@19.0.0)': { util: '1.1.0', react: '19.0.0' },
        'other@1.0.0': { util: '1.0.0' },
        'util@1.0.0': {},
        'util@1.1.0': {},
        'react@18.0.0': {},
        'react@19.0.0': {},
      },
    });
    // The react@18 variant is renamed and moves onto 1.1.0, which only its
    // retained react@19 sibling used, while `other` keeps 1.0.0.
    const renamed = lockfile('candidate', {
      snapshots: {
        'lib@1.0.0(react@18.3.0)': { util: '1.1.0', react: '18.3.0' },
        'lib@1.0.0(react@19.0.0)': { util: '1.1.0', react: '19.0.0' },
        'other@1.0.0': { util: '1.0.0' },
        'util@1.0.0': {},
        'util@1.1.0': {},
        'react@18.3.0': {},
        'react@19.0.0': {},
      },
    });

    expect(drift(renamed, ['react'], [], variantsParent).findings).toEqual([
      {
        copy: 'util@1.1.0',
        besides: [],
        users: [],
        moves: [
          {
            consumer: 'lib@1.0.0',
            from: ['util@1.0.0'],
            fromStaysInUse: true,
            downgrade: false,
          },
        ],
      },
    ]);

    // With both variants gone, the one left may succeed either, so it is
    // compared with both.
    const merged = lockfile('candidate', {
      snapshots: {
        'lib@1.0.0(react@20.0.0)': { util: '1.1.0', react: '20.0.0' },
        'other@1.0.0': { util: '1.0.0' },
        'util@1.0.0': {},
        'util@1.1.0': {},
        'react@20.0.0': {},
      },
    });
    expect(drift(merged, ['react'], [], variantsParent).findings).toEqual([]);
  });

  it('exempts only the major line an update names', () => {
    const linesParent = lockfile('parent', {
      snapshots: {
        'minimatch@10.2.6': { 'brace-expansion': '5.0.12' },
        'old-glob@7.0.0': { 'brace-expansion': '1.1.11' },
        'brace-expansion@5.0.12': {},
        'brace-expansion@1.1.11': {},
      },
    });
    const both = lockfile('candidate', {
      snapshots: {
        'minimatch@10.2.6': { 'brace-expansion': '5.0.13' },
        'old-glob@7.0.0': { 'brace-expansion': '1.1.12' },
        'brace-expansion@5.0.13': {},
        'brace-expansion@1.1.12': {},
      },
    });

    expect(copies(drift(both, ['brace-expansion@5'], [], linesParent))).toEqual(
      ['brace-expansion@1.1.12'],
    );
    expect(drift(both, ['brace-expansion'], [], linesParent).findings).toEqual(
      [],
    );
    // Every update that matches a changed copy is used.
    expect(
      drift(both, ['brace-expansion', 'brace-expansion@5'], [], linesParent)
        .unusedUpdates,
    ).toEqual([]);
  });

  it('reports an update that changes nothing', () => {
    const report = drift(candidateWith(cleanVitestUpdate), ['vitest', 'vite']);

    expect(report.findings).toEqual([]);
    expect(report.unusedUpdates).toEqual(['vite']);
    expect(lockfileDriftExitCode(report)).toBe(LOCKFILE_DRIFT_EXIT.unused);
  });

  it('reads importer devDependencies and snapshot optionalDependencies', () => {
    const raw = (
      label: string,
      versions: { tool: string; fsevents: string },
    ): LockfileText => ({
      label,
      text: stringify({
        lockfileVersion: '9.0',
        importers: {
          '.': {
            devDependencies: {
              tool: { specifier: '^1.0.0', version: versions.tool },
            },
          },
        },
        packages: {
          [`tool@${versions.tool}`]: {},
          [`fsevents@${versions.fsevents}`]: {},
          'chokidar@3.6.0': {},
        },
        snapshots: {
          [`tool@${versions.tool}`]: {},
          [`fsevents@${versions.fsevents}`]: {},
          'chokidar@3.6.0': {
            optionalDependencies: { fsevents: versions.fsevents },
          },
        },
      }),
    });
    const report = drift(
      raw('candidate', { tool: '1.0.1', fsevents: '2.3.3' }),
      ['other'],
      [],
      raw('parent', { tool: '1.0.0', fsevents: '2.3.2' }),
    );

    expect(
      report.findings.map(({ copy, moves }) => [
        copy,
        moves.map((move) => move.consumer),
      ]),
    ).toEqual([
      ['fsevents@2.3.3', ['chokidar@3.6.0']],
      ['tool@1.0.1', ['importer .']],
    ]);
  });

  // `a` moves from one copy to the other and the old copy goes, so only the
  // direction decides.
  it.each([
    ['a release to its prerelease', '2.0.0', '2.0.0-rc.1', true],
    ['a prerelease to its release', '2.0.0-rc.1', '2.0.0', false],
    ['a later prerelease to an earlier one', '2.0.0-rc.2', '2.0.0-rc.1', true],
    ['an earlier prerelease to a later one', '2.0.0-rc.1', '2.0.0-rc.2', false],
    ['a minor to a lower one, compared as numbers', '1.10.0', '1.9.0', true],
    ['rc.10 to rc.2, compared as numbers', '2.0.0-rc.10', '2.0.0-rc.2', true],
    ['rc.2 to rc.10, compared as numbers', '2.0.0-rc.2', '2.0.0-rc.10', false],
    ['a prerelease to a shorter one', '2.0.0-rc.1', '2.0.0-rc', true],
    ['a prerelease to a longer one', '2.0.0-rc', '2.0.0-rc.1', false],
    ['a word identifier to a number', '2.0.0-rc.beta', '2.0.0-rc.1', true],
    ['a number identifier to a word', '2.0.0-rc.1', '2.0.0-rc.beta', false],
    ['beta to alpha', '2.0.0-beta', '2.0.0-alpha', true],
    ['alpha to beta', '2.0.0-alpha', '2.0.0-beta', false],
    ['a version it cannot order', '1.0.0', '1.0', true],
  ])('orders a move from %s', (_name, from, to, downgrade) => {
    const orderParent = lockfile('parent', {
      snapshots: {
        'a@1.0.0': { util: from },
        'b@1.0.0': { util: to },
        [`util@${from}`]: {},
        [`util@${to}`]: {},
      },
    });
    const moved = lockfile('candidate', {
      snapshots: {
        'a@1.0.0': { util: to },
        'b@1.0.0': { util: to },
        [`util@${to}`]: {},
      },
    });

    expect(drift(moved, ['other'], [], orderParent).findings).toEqual(
      downgrade
        ? [
            {
              copy: `util@${to}`,
              besides: [],
              users: [],
              moves: [
                {
                  consumer: 'a@1.0.0',
                  from: [`util@${from}`],
                  fromStaysInUse: false,
                  downgrade: true,
                },
              ],
            },
          ]
        : [],
    );
  });

  it('treats each 0.x minor and each 0.0.x patch as its own caret line', () => {
    const zeroParent = lockfile('parent', {
      snapshots: {
        'a@1.0.0': { zero: '0.2.0' },
        'b@1.0.0': { zero: '0.0.3' },
        'c@1.0.0': { odd: '1.0' },
        'zero@0.2.0': {},
        'zero@0.0.3': {},
        'odd@1.0': {},
      },
    });
    const added = lockfile('candidate', {
      snapshots: {
        'a@1.0.0': { zero: '0.2.0' },
        'b@1.0.0': { zero: '0.0.3' },
        'c@1.0.0': { odd: '1.0' },
        'd@1.0.0': { zero: '0.2.1' },
        'e@1.0.0': { zero: '0.3.0' },
        'f@1.0.0': { zero: '0.0.4' },
        'g@1.0.0': { odd: '1.1' },
        'zero@0.2.0': {},
        'zero@0.0.3': {},
        'zero@0.2.1': {},
        'zero@0.3.0': {},
        'zero@0.0.4': {},
        'odd@1.0': {},
        'odd@1.1': {},
      },
    });

    // Only 0.2.1 shares a line with a copy already there; a version that is
    // not semver has a line of its own.
    expect(copies(drift(added, ['d'], [], zeroParent))).toEqual(['zero@0.2.1']);
  });

  it('reports a dependency an existing entry did not have before', () => {
    const report = drift(
      lockfile('candidate', {
        snapshots: { 'b@1.0.0': { extra: '1.0.0' }, 'extra@1.0.0': {} },
      }),
      ['other'],
      [],
      lockfile('parent', { snapshots: { 'b@1.0.0': {} } }),
    );

    expect(report.findings).toEqual([
      {
        copy: 'extra@1.0.0',
        besides: [],
        users: [],
        moves: [
          {
            consumer: 'b@1.0.0',
            from: [],
            fromStaysInUse: false,
            downgrade: false,
          },
        ],
      },
    ]);
  });

  it('reads a lockfile with missing sections and an entry with no fields', () => {
    const sparse = (label: string): LockfileText => ({
      label,
      text: stringify({
        lockfileVersion: '9.0',
        snapshots: { 'bare@1.0.0': null },
      }),
    });

    expect(
      drift(sparse('candidate'), ['other'], [], sparse('parent')).findings,
    ).toEqual([]);
  });

  it('refuses a section that is not a mapping', () => {
    const malformed: LockfileText = {
      label: 'malformed',
      text: stringify({ lockfileVersion: '9.0', packages: [] }),
    };

    expect(() => drift(malformed, ['other'])).toThrow(
      'malformed: packages must be a mapping',
    );
  });
});
