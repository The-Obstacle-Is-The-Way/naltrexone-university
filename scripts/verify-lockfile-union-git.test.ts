import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  gitLockfileReader,
  LOCKFILE_UNION_EXIT,
  runVerifyLockfileUnion,
} from './verify-lockfile-union';

const FIXTURES = path.join(import.meta.dirname, 'fixtures', 'lockfile-union');

// The PR #829 model shared with verify-lockfile-union.test.ts.
function fixture(name: string) {
  return { text: readFileSync(path.join(FIXTURES, `${name}.yaml`), 'utf8') };
}

const base = fixture('base');

describe('verify-lockfile-union against a real git repository', () => {
  let repository: string | undefined;

  afterEach(() => {
    if (repository) rmSync(repository, { recursive: true, force: true });
    repository = undefined;
  });

  // Inherited GIT_* variables (set inside git hooks) would redirect these
  // commands to the enclosing repository, so the child environment drops them.
  function isolatedGitEnv(home: string): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const name of Object.keys(env)) {
      if (name.startsWith('GIT_')) delete env[name];
    }
    return Object.assign(env, {
      HOME: home,
      GIT_CONFIG_GLOBAL: path.join(home, 'gitconfig'),
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'Fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.com',
      GIT_COMMITTER_NAME: 'Fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.com',
    });
  }

  function createRepository() {
    const directory = mkdtempSync(path.join(tmpdir(), 'lockfile-union-'));
    repository = directory;
    const env = isolatedGitEnv(directory);
    const git = (args: string[], input?: string) => {
      const result = spawnSync('git', args, {
        cwd: directory,
        env,
        input,
        encoding: 'utf8',
      });
      if (result.status !== 0) throw new Error(result.stderr);
      return result.stdout.trim();
    };
    // Commits are built from blobs and trees, so no branch is checked out
    // or switched while the fixture refs are created.
    const commitLockfile = (text: string, parent?: string) => {
      const blob = git(['hash-object', '-w', '--stdin'], text);
      const tree = git(['mktree'], `100644 blob ${blob}\tpnpm-lock.yaml\n`);
      return git([
        'commit-tree',
        tree,
        '-m',
        'lockfile',
        ...(parent ? ['-p', parent] : []),
      ]);
    };
    git(['init', '--quiet', '--initial-branch=main']);
    const baseCommit = commitLockfile(base.text);
    git(['update-ref', 'refs/heads/main', baseCommit]);
    for (const [number, name] of [
      ['826', 'source-826'],
      ['827', 'source-827'],
      ['828', 'source-828'],
      ['829', 'candidate-union'],
    ] as const) {
      git([
        'update-ref',
        `refs/pr/${number}`,
        commitLockfile(fixture(name).text, baseCommit),
      ]);
    }
    const state = () => ({
      head: git(['symbolic-ref', 'HEAD']),
      refs: git(['for-each-ref', '--format=%(refname) %(objectname)']),
      status: git(['status', '--porcelain', '--untracked-files=all']),
    });
    return { directory, env, git, state };
  }

  function run(argv: string[], directory: string, env: NodeJS.ProcessEnv) {
    const out: string[] = [];
    const err: string[] = [];
    const exitCode = runVerifyLockfileUnion(
      argv,
      gitLockfileReader({ cwd: directory, env }),
      { out: (text) => out.push(text), err: (text) => err.push(text) },
    );
    return { exitCode, out: out.join('\n'), err: err.join('\n') };
  }

  it('verifies fetched refs without checking out or moving any branch', () => {
    const { directory, env, state } = createRepository();
    const before = state();

    const result = run(
      [
        '--base',
        'refs/pr/826^',
        '--source',
        'refs/pr/826',
        '--source',
        'refs/pr/827',
        '--source',
        'refs/pr/828',
        '--candidate',
        'refs/pr/829',
      ],
      directory,
      env,
    );

    expect(result.exitCode).toBe(0);
    expect(result.out).toContain('PASS');
    expect(state()).toEqual(before);
  });

  it('verifies a working-tree candidate file against fetched refs', () => {
    const { directory, env } = createRepository();
    writeFileSync(
      path.join(directory, 'pnpm-lock.yaml'),
      fixture('candidate-newer-transitive').text,
    );

    const result = run(
      [
        '--base',
        'main',
        '--source',
        'refs/pr/826',
        '--source',
        'refs/pr/827',
        '--source',
        'refs/pr/828',
        '--candidate',
        'pnpm-lock.yaml',
      ],
      directory,
      env,
    );

    expect(result.exitCode).toBe(28);
    expect(result.out).toContain('FAIL (exit 28)');
  });

  it('exits with the usage code when a spec names no revision or file', () => {
    const { directory, env } = createRepository();

    const result = run(
      [
        '--base',
        'main',
        '--source',
        'refs/pr/826',
        '--source',
        'refs/pr/827',
        '--candidate',
        'refs/pr/does-not-exist',
      ],
      directory,
      env,
    );

    expect(result.exitCode).toBe(LOCKFILE_UNION_EXIT.usage);
    expect(result.err).toContain(
      '"refs/pr/does-not-exist" is neither a file nor a git revision',
    );
  });

  it('exits with the usage code when a revision has no lockfile', () => {
    const { directory, env, git } = createRepository();
    const blob = git(['hash-object', '-w', '--stdin'], '{}\n');
    const tree = git(['mktree'], `100644 blob ${blob}\tpackage.json\n`);
    git([
      'update-ref',
      'refs/pr/no-lockfile',
      git(['commit-tree', tree, '-m', 'no lockfile']),
    ]);

    const result = run(
      [
        '--base',
        'main',
        '--source',
        'refs/pr/826',
        '--source',
        'refs/pr/827',
        '--candidate',
        'refs/pr/no-lockfile',
      ],
      directory,
      env,
    );

    expect(result.exitCode).toBe(LOCKFILE_UNION_EXIT.usage);
    expect(result.err).toContain('cannot read pnpm-lock.yaml at');
  });

  it('rejects a name that is both a file and a revision', () => {
    const { directory, env } = createRepository();
    writeFileSync(path.join(directory, 'main'), base.text);

    const result = run(
      [
        '--base',
        'main',
        '--source',
        'refs/pr/826',
        '--source',
        'refs/pr/827',
        '--candidate',
        'refs/pr/829',
      ],
      directory,
      env,
    );

    expect(result.exitCode).toBe(LOCKFILE_UNION_EXIT.usage);
    expect(result.err).toContain('is both a file and a git revision');
  });
});
