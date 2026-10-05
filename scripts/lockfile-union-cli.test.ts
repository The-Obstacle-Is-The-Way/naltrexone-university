import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type LockfileReader,
  LockfileUnionInputError,
  parseLockfileUnionArgs,
  readLockfileSpec,
  runVerifyLockfileUnion,
} from './lockfile-union';

const FIXTURES = path.join(import.meta.dirname, 'fixtures', 'lockfile-union');

// The PR #829 model shared with lockfile-union.test.ts.
function fixture(name: string) {
  return { text: readFileSync(path.join(FIXTURES, `${name}.yaml`), 'utf8') };
}

const base = fixture('base');
const source826 = fixture('source-826');
const source827 = fixture('source-827');

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

  const valid = ['--source', 's1', '--source', 's2', '--candidate', 'c'];

  // Each case names the message that rejects it, so no case can pass because
  // a different check happened to reject the same input.
  it.each([
    ['no arguments', [], /Need --base, --candidate and at least two --source/],
    [
      'one source',
      ['--base', 'b', '--source', 's', '--candidate', 'c'],
      /Need --base, --candidate and at least two --source/,
    ],
    [
      'a duplicate source',
      ['--base', 'b', '--source', 's', '--source', 's', '--candidate', 'c'],
      /Duplicate source s\./,
    ],
    [
      'a repeated base',
      ['--base', 'b', '--base', 'b2', ...valid],
      /--base given more than once\./,
    ],
    [
      'a candidate that is also a source',
      ['--base', 'b', '--source', 'c', '--source', 's2', '--candidate', 'c'],
      /The candidate c is also a source\./,
    ],
    [
      'a missing value',
      ['--base', 'b', '--source', 's1', '--source', 's2', '--candidate'],
      /--candidate needs a value\./,
    ],
    [
      'a flag as a value',
      ['--base', '--source', '--source', 's2', '--candidate', 'c'],
      /--base needs a value\./,
    ],
    [
      'a trailing flag without a value',
      ['--base', 'b', ...valid, '--fix'],
      /--fix needs a value\./,
    ],
  ])('rejects %s', (_name, argv, message) => {
    const act = () => parseLockfileUnionArgs(argv);

    expect(act).toThrowError(message);
    expect(act).toThrowError(/Usage: tsx scripts\/verify-lockfile-union\.ts/);
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
    [
      'is both a file and a revision',
      { dev: 'x' },
      { dev: 'abc' },
      'dev',
      /is both a file and a git revision/,
    ],
    [
      'is neither a file nor a revision',
      {},
      {},
      'nope',
      /is neither a file nor a git revision/,
    ],
    // The reader would resolve this spec, so only the dash guard rejects it.
    [
      'starts with a dash',
      {},
      { '-p': 'abc' },
      '-p',
      /must not start with "-"/,
    ],
  ])('rejects a spec that %s', (_name, files, commits, spec, message) => {
    const { lockfileReader } = reader(files, commits);
    const act = () => readLockfileSpec(spec, lockfileReader);

    expect(act).toThrow(LockfileUnionInputError);
    expect(act).toThrow(message);
  });
});

describe('runVerifyLockfileUnion', () => {
  it('refuses a candidate whose lockfile is identical to a source', () => {
    const files: Record<string, string> = {
      base: base.text,
      a: source826.text,
      b: source827.text,
      bundle: source827.text,
    };
    const fileReader: LockfileReader = {
      isFile: (spec) => spec in files,
      readFile: (spec) => files[spec] ?? '',
      resolveCommit: () => null,
      showLockfile: () => '',
    };
    const err: string[] = [];

    const exitCode = runVerifyLockfileUnion(
      [
        '--base',
        'base',
        '--source',
        'a',
        '--source',
        'b',
        '--candidate',
        'bundle',
      ],
      fileReader,
      { out: () => undefined, err: (text) => err.push(text) },
    );

    expect(exitCode).toBe(2);
    expect(err.join('\n')).toContain(
      'The candidate bundle has the same lockfile as source b',
    );
  });

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
