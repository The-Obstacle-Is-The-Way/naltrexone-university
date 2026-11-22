import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import {
  compareLockfileDrift,
  formatLockfileDriftReport,
  LOCKFILE_DRIFT_EXIT,
  parseLockfileDriftArgs,
  runVerifyLockfileDrift,
} from './lockfile-drift';
import type { LockfileReader, LockfileText } from './lockfile-union';

// `tool` updates; `x` shares `util` with it.
function lockfile(
  label: string,
  snapshots: Record<string, Record<string, string>>,
): LockfileText {
  const packages = Object.fromEntries(
    Object.keys(snapshots).map((key) => [key, {}]),
  );
  const entries = Object.fromEntries(
    Object.entries(snapshots).map(([key, dependencies]) => [
      key,
      { dependencies },
    ]),
  );
  return {
    label,
    text: stringify({ lockfileVersion: '9.0', packages, snapshots: entries }),
  };
}
const parent = lockfile('parent', {
  'tool@1.0.0': { util: '1.0.0' },
  'x@1.0.0': { util: '1.0.0' },
  'util@1.0.0': {},
});
const clean = lockfile('candidate', {
  'tool@1.1.0': { util: '1.0.0' },
  'x@1.0.0': { util: '1.0.0' },
  'util@1.0.0': {},
});
const drifted = lockfile('candidate', {
  'tool@1.1.0': { util: '1.0.0' },
  'x@1.0.0': { util: '1.1.0' },
  'util@1.0.0': {},
  'util@1.1.0': {},
});

function report(
  candidate: LockfileText,
  updates: string[],
  allowed: string[] = [],
  from = parent,
) {
  return formatLockfileDriftReport(
    compareLockfileDrift({ parent: from, candidate, updates, allowed }),
  );
}

describe('formatLockfileDriftReport', () => {
  it('states a pass with its inputs', () => {
    const text = report(clean, ['tool']);

    expect(text).toContain('## Lockfile drift check');
    expect(text).toContain(
      'Parent: `parent`. Candidate: `candidate`. Updates: `tool`. Allowed: none.',
    );
    expect(text).toContain(
      'PASS: outside the named updates, no new copy sits beside another, and no entry the parent had moves onto a new, still-shared or older copy.',
    );
  });

  it('names each drifted copy and its moves, and how to clear it', () => {
    const text = report(drifted, ['tool']);

    expect(text).toContain('FAIL (exit 4): 1 copy outside the named updates.');
    expect(text).toContain(
      '- `util@1.1.0`: a new copy beside `util@1.0.0`. `x@1.0.0` moved onto it from `util@1.0.0`, which stays in use.',
    );
    expect(text).toContain('--allow <consumer>><name>@<version>');
  });

  it('names the new entries that use a drifted copy', () => {
    const text = report(
      lockfile('candidate', {
        'tool@1.1.0': { util: '1.1.0' },
        'x@1.0.0': { util: '1.0.0' },
        'util@1.0.0': {},
        'util@1.1.0': {},
      }),
      ['tool'],
    );

    expect(text).toContain(
      '- `util@1.1.0`: a new copy beside `util@1.0.0`. Used by new entries `tool@1.1.0`.',
    );
  });

  it('describes a downgrade, a new dependency and a plural count', () => {
    const text = report(
      lockfile('candidate', {
        'a@1.0.0': { util: '1.0.0' },
        'b@1.0.0': { util: '1.0.0' },
        'c@1.0.0': { extra: '1.0.0' },
        'extra@1.0.0': {},
        'util@1.0.0': {},
      }),
      ['other'],
      [],
      lockfile('parent', {
        'a@1.0.0': { util: '2.0.0' },
        'b@1.0.0': { util: '1.0.0' },
        'c@1.0.0': {},
        'util@1.0.0': {},
        'util@2.0.0': {},
      }),
    );

    expect(text).toContain(
      'FAIL (exit 12): 2 copies outside the named updates; `--update other` changes nothing.',
    );
    expect(text).toContain(
      '- `extra@1.0.0`: a new copy. `c@1.0.0` moved onto it from no earlier dependency.',
    );
    expect(text).toContain(
      '- `util@1.0.0`: a copy the parent already had. `a@1.0.0` moved onto it from `util@2.0.0`, a downgrade.',
    );
  });

  it('names an allowance that matched nothing and an update that changed nothing', () => {
    const text = report(clean, ['tool', 'vite'], ['x@1.0.0>ws@8.23.0']);

    expect(text).toContain(
      'FAIL (exit 8): `x@1.0.0>ws@8.23.0` matches no finding; `--update vite` changes nothing.',
    );
  });
});

describe('parseLockfileDriftArgs', () => {
  it('reads one parent, one candidate, repeated updates and allowances', () => {
    expect(
      parseLockfileDriftArgs([
        '--parent',
        'HEAD^',
        '--candidate',
        'HEAD',
        '--update',
        'ws',
        '--update',
        'vite',
        '--update',
        'brace-expansion@5',
        '--allow',
        '@babel/helpers@8.0.8>@babel/types@8.1.2',
        '--allow',
        'importer .>vite@8.3.8',
      ]),
    ).toEqual({
      parent: 'HEAD^',
      candidate: 'HEAD',
      updates: ['ws', 'vite', 'brace-expansion@5'],
      allowed: [
        '@babel/helpers@8.0.8>@babel/types@8.1.2',
        'importer .>vite@8.3.8',
      ],
    });
  });

  const valid = ['--parent', 'p', '--candidate', 'c', '--update', 'ws'];

  it.each([
    [
      'no arguments',
      [],
      /Need --parent, --candidate and at least one --update/,
    ],
    [
      'no update',
      ['--parent', 'p', '--candidate', 'c'],
      /Need --parent, --candidate and at least one --update/,
    ],
    ['a forwarded pnpm separator', ['--', ...valid], /Unknown argument --\./],
    ['an unknown flag', [...valid, '--base', 'b'], /Unknown argument --base\./],
    [
      'a flag without a value',
      [...valid, '--allow'],
      /--allow needs a value\./,
    ],
    [
      'a repeated parent',
      [...valid, '--parent', 'p2'],
      /--parent given more than once\./,
    ],
    [
      'a duplicate update',
      [...valid, '--update', 'ws'],
      /Duplicate --update ws\./,
    ],
    [
      'a duplicate allowance',
      [...valid, '--allow', 'x@1.0.0>y@1.0.0', '--allow', 'x@1.0.0>y@1.0.0'],
      /Duplicate --allow x@1\.0\.0>y@1\.0\.0\./,
    ],
    [
      'an allowance without a consumer',
      [...valid, '--allow', '@babel/types@8.1.2'],
      /--allow takes <consumer>><name>@<version>: @babel\/types@8\.1\.2\./,
    ],
    [
      'an allowance without a version',
      [...valid, '--allow', 'x@1.0.0>@babel/types'],
      /--allow takes <consumer>><name>@<version>: x@1\.0\.0>@babel\/types\./,
    ],
    [
      'an update with a full version',
      [...valid, '--update', 'vite@8.3.8'],
      /--update takes a package name or name@<major>: vite@8\.3\.8\./,
    ],
    [
      'the same parent and candidate',
      ['--parent', 'p', '--candidate', 'p', '--update', 'ws'],
      /The parent and the candidate are both p\./,
    ],
  ])('refuses %s', (_name, args, message) => {
    expect(() => parseLockfileDriftArgs(args)).toThrow(message);
  });
});

describe('runVerifyLockfileDrift', () => {
  // An in-memory reader: each spec names a file holding one lockfile.
  function reader(files: Record<string, LockfileText>): LockfileReader {
    return {
      isFile: (spec) => spec in files,
      readFile: (spec) => files[spec]?.text ?? '',
      resolveCommit: () => null,
      showLockfile: () => '',
    };
  }

  function run(argv: string[], files: Record<string, LockfileText>) {
    const out: string[] = [];
    const err: string[] = [];
    const status = runVerifyLockfileDrift(argv, reader(files), {
      out: (text) => out.push(text),
      err: (text) => err.push(text),
    });
    return { status, out: out.join('\n'), err: err.join('\n') };
  }

  const args = ['--parent', 'p.yaml', '--candidate', 'c.yaml'];

  it('prints the report and exits 0 for a clean update', () => {
    const result = run([...args, '--update', 'tool'], {
      'p.yaml': parent,
      'c.yaml': clean,
    });

    expect(result.status).toBe(0);
    expect(result.out).toContain('PASS');
  });

  it('exits 4 for drift', () => {
    const result = run([...args, '--update', 'tool'], {
      'p.yaml': parent,
      'c.yaml': drifted,
    });

    expect(result.status).toBe(LOCKFILE_DRIFT_EXIT.drift);
    expect(result.out).toContain('`util@1.1.0`');
  });

  it('lets an unexpected error through', () => {
    const failing: LockfileReader = {
      isFile: () => {
        throw new Error('disk failure');
      },
      readFile: () => '',
      resolveCommit: () => null,
      showLockfile: () => '',
    };

    expect(() =>
      runVerifyLockfileDrift([...args, '--update', 'tool'], failing, {
        out: () => {},
        err: () => {},
      }),
    ).toThrow('disk failure');
  });

  it('exits 2 with the message for an input error', () => {
    const result = run([...args, '--update', 'tool'], { 'p.yaml': parent });

    expect(result.status).toBe(LOCKFILE_DRIFT_EXIT.usage);
    expect(result.err).toContain(
      '"c.yaml" is neither a file nor a git revision',
    );
    expect(result.out).toBe('');
  });
});
