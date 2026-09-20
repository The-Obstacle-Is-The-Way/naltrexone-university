import { ChildProcess, execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import packageJson from '../package.json';
import {
  pullVercelDatabaseUrl,
  readDatabaseUrlFromFile,
  runProcess,
  runVercelCommand,
  SEED_ENVIRONMENT_COMMAND_TIMEOUT_MS,
  type SeedProcessSpawner,
} from './seed-environment-runtime';

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFileSync: vi.fn(),
}));

afterEach(() => vi.resetAllMocks());

describe('seed environment runtime', () => {
  it('keeps the owner-run Vercel CLI outside the application dependency graph', () => {
    expect({
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    }).not.toHaveProperty('vercel');
  });

  it.each(['development', 'preview', 'production'] as const)(
    'pulls %s only through the verified preinstalled CLI',
    async (environment) => {
      const run = vi.fn(async () => '59.16.0\n');
      const read = vi.fn(async () => 'postgresql://example.invalid/test');

      await pullVercelDatabaseUrl('/scratch', environment, run, read);

      expect(run.mock.calls).toEqual([
        [['--version']],
        [
          [
            'env',
            'pull',
            `/scratch/${environment}.env`,
            `--environment=${environment}`,
          ],
        ],
      ]);
    },
  );

  it('reads the selected environment only after the CLI has completed', async () => {
    const calls: string[] = [];
    const run = async (args: readonly string[]) => {
      await Promise.resolve();
      if (args[0] === '--version') return '59.16.0';
      calls.push('pull');
      return '';
    };
    const read = vi.fn(async () => {
      calls.push('read');
      return 'postgresql://example.invalid/test';
    });

    expect(await pullVercelDatabaseUrl('/scratch', 'preview', run, read)).toBe(
      'postgresql://example.invalid/test',
    );
    expect(read).toHaveBeenCalledExactlyOnceWith('/scratch/preview.env');
    expect(calls).toEqual(['pull', 'read']);
  });

  it.each(['--version', 'env'])(
    'refuses a stale environment file when the CLI %s command fails',
    async (failedCommand) => {
      const failure = new Error(
        'Seed environment command failed (exit code 7).',
      );
      const read = vi.fn(async () => 'must not be used');

      await expect(
        pullVercelDatabaseUrl(
          '/scratch',
          'production',
          async (args) => {
            if (args[0] === failedCommand) throw failure;
            return '59.16.0';
          },
          read,
        ),
      ).rejects.toBe(failure);
      expect(read).not.toHaveBeenCalled();
    },
  );

  it.each(['59.23.2', '59.15.1', '59.16.0-canary.1', '', '59.16.0\nextra'])(
    'refuses unreviewed or malformed CLI version %j before pulling an environment',
    async (version) => {
      const run = vi.fn(async () => version);
      const read = vi.fn(async () => 'must not be used');

      await expect(
        pullVercelDatabaseUrl('/scratch', 'production', run, read),
      ).rejects.toThrow('Seeding requires preinstalled Vercel CLI 59.16.0.');
      expect(run).toHaveBeenCalledExactlyOnceWith(['--version']);
      expect(read).not.toHaveBeenCalled();
    },
  );

  it('bounds the preinstalled CLI and captures its output without shell execution', () => {
    vi.mocked(execFileSync).mockReturnValue('59.16.0\n');

    expect(runVercelCommand(['--version'])).toBe('59.16.0\n');
    expect(execFileSync).toHaveBeenCalledExactlyOnceWith(
      'vercel',
      ['--version'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: SEED_ENVIRONMENT_COMMAND_TIMEOUT_MS,
        killSignal: 'SIGTERM',
      },
    );
  });

  it('reports CLI failure without echoing captured provider output', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('untrusted command output');
    });

    expect(() => runVercelCommand(['env', 'pull', 'production.env'])).toThrow(
      'Preinstalled Vercel CLI failed; verify the reviewed version and authentication before seeding.',
    );
  });

  it('preserves the environment-file read failure as the contextual error cause', async () => {
    const sourceError = new Error('permission denied');
    const readFile = vi.fn(async (_filePath: string) => {
      throw sourceError;
    });

    await expect(
      readDatabaseUrlFromFile('production.env', readFile),
    ).rejects.toMatchObject({
      message: 'Unable to read the required environment file production.env.',
      cause: sourceError,
    });
  });

  it('bounds child commands with the shared timeout and termination signal', async () => {
    const child = new ChildProcess();
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'test' };
    const spawnProcess = vi.fn<SeedProcessSpawner>(
      (_command, _args, _options) => {
        queueMicrotask(() => child.emit('exit', 0, null));
        return child;
      },
    );

    await runProcess('pnpm', ['example'], env, false, spawnProcess);

    expect(spawnProcess).toHaveBeenCalledWith('pnpm', ['example'], {
      env,
      stdio: 'inherit',
      timeout: SEED_ENVIRONMENT_COMMAND_TIMEOUT_MS,
      killSignal: 'SIGTERM',
    });
  });

  it('rejects when a timed-out child exits through the termination signal', async () => {
    const child = new ChildProcess();
    const spawnProcess = vi.fn<SeedProcessSpawner>(
      (_command, _args, _options) => {
        queueMicrotask(() => child.emit('exit', null, 'SIGTERM'));
        return child;
      },
    );

    await expect(
      runProcess(
        'pnpm',
        ['example'],
        { NODE_ENV: 'test' },
        false,
        spawnProcess,
      ),
    ).rejects.toThrow('Seed environment command failed (signal SIGTERM).');
  });
});
