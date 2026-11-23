import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { compareLockfileDrift } from './lockfile-drift';
import { lockfile } from './lockfile-drift-test-helpers';
import type { LockfileText } from './lockfile-union';

function drift(
  candidate: LockfileText,
  updates: string[],
  allowed: string[],
  from: LockfileText,
) {
  return compareLockfileDrift({ parent: from, candidate, updates, allowed });
}

// An entry's key carries its peers, so a peer change renames it, and one
// package can have several peer variants.
describe('compareLockfileDrift with peer variants', () => {
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

  it('keeps every new peer variant as a user, so an allowance cannot hide one', () => {
    const toolParent = lockfile('parent', {
      snapshots: {
        'y@1.0.0': { util: '1.0.0' },
        'other@1.0.0': { util: '1.0.0' },
        'util@1.0.0': {},
      },
    });
    // Only the first new variant uses the new copy.
    const twoVariants = lockfile('candidate', {
      snapshots: {
        'tool@2.0.0(react@18.0.0)': { util: '1.1.0' },
        'tool@2.0.0(react@19.0.0)': {},
        'y@1.0.0': { util: '1.1.0' },
        'other@1.0.0': { util: '1.0.0' },
        'util@1.0.0': {},
        'util@1.1.0': {},
      },
    });

    const report = drift(
      twoVariants,
      ['react'],
      ['y@1.0.0>util@1.1.0'],
      toolParent,
    );
    expect(report.findings.map(({ copy, users }) => [copy, users])).toEqual([
      ['util@1.1.0', ['tool@2.0.0']],
    ]);
  });

  it('keeps every move by the peer variants of one entry onto a copy', () => {
    const variantsParent = lockfile('parent', {
      snapshots: {
        'lib@1.0.0(react@18.0.0)': { util: '1.0.0' },
        'lib@1.0.0(react@19.0.0)': { util: '1.2.0' },
        'other@1.0.0': { util: '1.0.0' },
        'util@1.0.0': {},
        'util@1.1.0': {},
        'util@1.2.0': {},
      },
    });
    // One variant leaves a copy still in use; the other moves down from a
    // copy that goes.
    const moved = lockfile('candidate', {
      snapshots: {
        'lib@1.0.0(react@18.0.0)': { util: '1.1.0' },
        'lib@1.0.0(react@19.0.0)': { util: '1.1.0' },
        'other@1.0.0': { util: '1.0.0' },
        'util@1.0.0': {},
        'util@1.1.0': {},
      },
    });

    expect(drift(moved, ['other'], [], variantsParent).findings).toEqual([
      {
        copy: 'util@1.1.0',
        besides: [],
        users: [],
        moves: [
          {
            consumer: 'lib@1.0.0',
            from: ['util@1.0.0', 'util@1.2.0'],
            fromStaysInUse: true,
            downgrade: true,
          },
        ],
      },
    ]);
  });

  it('keeps importer paths whole, parentheses included', () => {
    const importers = (legacy: string, modern: string): LockfileText => ({
      label: 'importers',
      text: stringify({
        lockfileVersion: '9.0',
        importers: {
          '.': {
            dependencies: { tool: { specifier: '^1.0.0', version: '1.0.0' } },
          },
          'packages/app(legacy)': {
            dependencies: { tool: { specifier: '^1.0.0', version: legacy } },
          },
          'packages/app(modern)': {
            dependencies: { tool: { specifier: '^1.0.0', version: modern } },
          },
        },
        packages: { 'tool@1.0.0': {}, 'tool@1.1.0': {} },
        snapshots: { 'tool@1.0.0': {}, 'tool@1.1.0': {} },
      }),
    });
    const parentImporters = importers('1.0.0', '1.0.0');
    const bothMoved = importers('1.1.0', '1.1.0');

    expect(
      drift(bothMoved, ['other'], [], parentImporters).findings[0]?.moves.map(
        (move) => move.consumer,
      ),
    ).toEqual([
      'importer packages/app(legacy)',
      'importer packages/app(modern)',
    ]);
    // An allowance for one importer covers that importer only.
    expect(
      drift(
        bothMoved,
        ['other'],
        ['importer packages/app(legacy)>tool@1.1.0'],
        parentImporters,
      ).findings[0]?.moves.map((move) => move.consumer),
    ).toEqual(['importer packages/app(modern)']);
  });
});
