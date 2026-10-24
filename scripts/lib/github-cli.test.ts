import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGhRunner } from './github-cli.mts';

let directory: string;
let executable: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'nu-gh-transport-'));
  executable = join(directory, 'gh');
  writeFileSync(
    executable,
    `#!${process.execPath}\n` +
      `
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === 'fail') { process.stderr.write('synthetic diagnostic'); process.exit(3); }
else if (args[0] === 'wait') setTimeout(() => {}, 5000);
else if (args[0] === 'overflow') process.stdout.write('x'.repeat(4096));
else process.stdout.write(JSON.stringify({ args, input: fs.readFileSync(0, 'utf8'), utf8: 'é' }));
`,
  );
  chmodSync(executable, 0o700);
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe('GitHub CLI transport', () => {
  it('preserves argv, UTF-8 stdout and stdin without shell interpretation', () => {
    const gh = createGhRunner({ timeout: 1000, maxBuffer: 8192 }, executable);
    expect(
      JSON.parse(gh(['api', 'literal $(text)', 'two words'], 'body\n')),
    ).toEqual({
      args: ['api', 'literal $(text)', 'two words'],
      input: 'body\n',
      utf8: 'é',
    });
  });
  it('captures stderr without publishing it and preserves the original exit evidence', () => {
    const source = `import { createGhRunner } from ${JSON.stringify(pathToFileURL(join(process.cwd(), 'scripts/lib/github-cli.mts')).href)};
try { createGhRunner({timeout:1000}, ${JSON.stringify(executable)})(['fail']); }
catch (error) { console.log(JSON.stringify({status:error.status,stderr:error.stderr})); }`;
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', source],
      { encoding: 'utf8' },
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({
      status: 3,
      stderr: 'synthetic diagnostic',
    });
  });
  it('enforces the caller timeout', () => {
    expect(() =>
      createGhRunner({ timeout: 100 }, executable)(['wait']),
    ).toThrow(/ETIMEDOUT/);
  });
  it('enforces the caller output bound', () => {
    expect(() =>
      createGhRunner(
        { timeout: 1000, maxBuffer: 1024 },
        executable,
      )(['overflow']),
    ).toThrow(/ENOBUFS/);
  });
});
