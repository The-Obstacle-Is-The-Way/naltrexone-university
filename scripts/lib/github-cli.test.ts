import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGhRunner, withGhFailureReason } from './github-cli.mts';

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
else if (args[0] === 'stderr') { process.stdout.write('{"message":"Not Found"}'); process.stderr.write(args[1]); process.exit(1); }
else if (args[0] === 'wait') setTimeout(() => {}, 5000);
else if (args[0] === 'silent') process.exit(1);
else if (args[0] === 'die') process.kill(process.pid, 'SIGKILL');
else if (args[0] === 'stall') { process.stderr.write('gh: partial output'); setTimeout(() => {}, 5000); }
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

describe('withGhFailureReason', () => {
  const line = 'Job failed; inspect GitHub issue access.';
  const failure = (
    args: string[],
    limits: Parameters<typeof createGhRunner>[0] = { timeout: 1000 },
  ) => {
    try {
      createGhRunner(limits, executable)(args);
    } catch (error) {
      return error;
    }
    throw new Error('gh did not fail');
  };

  it.each([
    ['a REST error', 'gh: Not Found (HTTP 404)\n', 'gh: Not Found (HTTP 404)'],
    [
      'a GraphQL error',
      "GraphQL: Could not resolve to a Repository with the name 'a/b'. (repository)\n",
      "GraphQL: Could not resolve to a Repository with the name 'a/b'. (repository)",
    ],
    [
      'the first line of a longer error',
      '\nHTTP 401: Bad credentials (https://api.github.com/graphql)\nTry authenticating with:  gh auth login\n',
      'HTTP 401: Bad credentials (https://api.github.com/graphql)',
    ],
  ])('adds gh’s own line for %s', (_, stderr, reason) => {
    expect(withGhFailureReason(line, failure(['stderr', stderr]))).toBe(
      `${line} Cause: ${reason}`,
    );
  });

  it('caps an overlong line', () => {
    const reason = withGhFailureReason(
      line,
      failure(['stderr', `gh: ${'x'.repeat(500)}`]),
    ).slice(line.length + ' Cause: '.length);
    expect(reason).toHaveLength(200);
    expect(reason.endsWith('…')).toBe(true);
  });

  it.each([
    ['a timeout', () => failure(['wait'], { timeout: 100 }), 'ETIMEDOUT'],
    [
      'an output overflow',
      () => failure(['overflow'], { timeout: 1000, maxBuffer: 1024 }),
      'ENOBUFS',
    ],
    [
      'a missing executable',
      () => {
        try {
          createGhRunner({ timeout: 1000 }, join(directory, 'missing'))([]);
        } catch (error) {
          return error;
        }
        throw new Error('the missing executable ran');
      },
      'ENOENT',
    ],
  ])('adds the transport failure’s code for %s', (_, fail, code) => {
    expect(withGhFailureReason(line, fail())).toBe(`${line} Cause: ${code}`);
  });

  it('lets a timeout’s code win over output written before it', () => {
    const error = failure(['stall'], { timeout: 500 });
    expect(error).toHaveProperty('stderr', 'gh: partial output');
    expect(withGhFailureReason(line, error)).toBe(`${line} Cause: ETIMEDOUT`);
  });

  it.each([
    ['an exit with no error output', ['silent'], 'exit status 1'],
    ['a kill by signal', ['die'], 'killed by SIGKILL'],
  ])('names %s', (_, args, reason) => {
    expect(withGhFailureReason(line, failure(args))).toBe(
      `${line} Cause: ${reason}`,
    );
  });

  it.each([
    ['a plain error', new Error('private fixture detail')],
    [
      'an error the runner did not throw, even one shaped like gh’s',
      Object.assign(new Error('Command failed: git log'), {
        status: 1,
        stderr: 'fatal: private detail\n',
      }),
    ],
    [
      'a file error',
      Object.assign(new Error('ENOENT: private path'), {
        code: 'ENOENT',
        syscall: 'open',
      }),
    ],
    ['a thrown value', 'private fixture detail'],
  ])('keeps the line alone for %s', (_, error) => {
    expect(withGhFailureReason(line, error)).toBe(line);
  });
});
