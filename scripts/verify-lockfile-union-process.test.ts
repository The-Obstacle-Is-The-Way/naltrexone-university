import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { isEntryPoint, LOCKFILE_UNION_EXIT } from './verify-lockfile-union';

const SCRIPT = path.join(import.meta.dirname, 'verify-lockfile-union.ts');
const SCRIPT_URL = pathToFileURL(SCRIPT).href;

describe('verify-lockfile-union entry point', () => {
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

  it('recognizes the script run by its own path', () => {
    expect(isEntryPoint(SCRIPT_URL, SCRIPT)).toBe(true);
  });

  it('recognizes the script run through a symlink', () => {
    expect(isEntryPoint(SCRIPT_URL, linkToScript())).toBe(true);
  });

  it.each([
    ['another file', path.join(import.meta.dirname, 'verify-promotion.ts')],
    ['a path that does not exist', path.join(tmpdir(), 'no-such-verifier.ts')],
    ['no path', undefined],
  ])('does not treat %s as the entry point', (_name, argvPath) => {
    expect(isEntryPoint(SCRIPT_URL, argvPath)).toBe(false);
  });

  // A symlinked invocation once skipped the CLI and exited 0 without
  // verifying anything, which automation would read as a pass.
  it('runs the CLI when invoked through a symlink', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', linkToScript(), '--base', 'does-not-exist'],
      {
        cwd: path.join(import.meta.dirname, '..'),
        encoding: 'utf8',
        timeout: 30_000,
      },
    );

    expect(result.status).toBe(LOCKFILE_UNION_EXIT.usage);
    expect(result.stderr).toContain(
      'Usage: tsx scripts/verify-lockfile-union.ts',
    );
  }, 30_000);
});
