import { ChildProcess } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import {
  readDatabaseUrlFromFile,
  runProcess,
  SEED_ENVIRONMENT_COMMAND_TIMEOUT_MS,
  type SeedProcessSpawner,
} from './seed-environment-runtime';

describe('seed environment runtime', () => {
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
