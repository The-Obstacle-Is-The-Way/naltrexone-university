import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const REPOSITORY = path.join(import.meta.dirname, '..');
const SCRIPT = path.join(import.meta.dirname, 'verify-lockfile-union.ts');
const FIXTURES = path.join('scripts', 'fixtures', 'lockfile-union');
const SOURCES = ['source-826', 'source-827', 'source-828'].flatMap((name) => [
  '--source',
  path.join(FIXTURES, `${name}.yaml`),
]);

function cli(script: string, args: string[]) {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', script, ...args],
    {
      cwd: REPOSITORY,
      encoding: 'utf8',
      timeout: 30_000,
    },
  );
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function verify(candidate: string, script = SCRIPT) {
  return cli(script, [
    '--base',
    path.join(FIXTURES, 'base.yaml'),
    ...SOURCES,
    '--candidate',
    path.join(FIXTURES, `${candidate}.yaml`),
  ]);
}

// The CLI runs as a real process, so these exit codes are the ones automation
// sees. An earlier entry-point check skipped the CLI, and exited 0 without
// verifying anything, for symlinked and extensionless invocations.
describe('verify-lockfile-union CLI', () => {
  let directory: string | undefined;

  afterEach(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = undefined;
  });

  function linkToScript() {
    directory = mkdtempSync(path.join(tmpdir(), 'lockfile-union-entry-'));
    const link = path.join(directory, 'verifier.ts');
    symlinkSync(SCRIPT, link);
    return link;
  }

  it('exits 0 for the #829 bundle that is exactly the source union', () => {
    const result = verify('candidate-union');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('PASS');
  }, 30_000);

  it('exits 28 when a newer transitive replaces the source resolution', () => {
    const result = verify('candidate-newer-transitive');

    expect(result.status).toBe(28);
    expect(result.stdout).toContain('FAIL (exit 28)');
  }, 30_000);

  it.each([
    ['by its own path', () => SCRIPT],
    ['without its extension', () => SCRIPT.replace(/\.ts$/, '')],
    ['through a symlink', () => undefined],
  ])(
    'runs when invoked %s',
    (_name, scriptPath) => {
      const script = scriptPath() ?? linkToScript();

      const result = verify('candidate-newer-transitive', script);

      expect(result.status).toBe(28);
    },
    30_000,
  );

  it('exits 2 with usage for bad arguments', () => {
    const result = cli(SCRIPT, ['--base', 'does-not-exist']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      'Usage: tsx scripts/verify-lockfile-union.ts',
    );
  }, 30_000);
});
