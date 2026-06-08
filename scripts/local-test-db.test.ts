import { describe, expect, it, vi } from 'vitest';
import { runEnsureLocalTestDatabase } from './ensure-local-test-db';
import {
  ensureLocalTestDatabase,
  runTestDbCommand,
  TEST_DB_CONTAINER_NAME,
  type TestDbCommandRunner,
} from './local-test-db';

function createCommandRunner(
  results: Array<{ exitCode: number; stdout?: string; stderr?: string }>,
): TestDbCommandRunner {
  const queue = [...results];

  return vi.fn(async () => {
    const next = queue.shift();
    if (!next) {
      throw new Error('Unexpected command call.');
    }

    return {
      exitCode: next.exitCode,
      stdout: next.stdout ?? '',
      stderr: next.stderr ?? '',
    };
  });
}

describe('ensureLocalTestDatabase', () => {
  it('starts docker compose when the named test DB container does not exist', async () => {
    const runCommand = createCommandRunner([
      { exitCode: 1 },
      { exitCode: 0 },
      { exitCode: 0, stdout: 'healthy\n' },
    ]);

    await expect(ensureLocalTestDatabase({ runCommand })).resolves.toBe(
      'created',
    );

    expect(runCommand).toHaveBeenCalledTimes(3);
    expect(runCommand).toHaveBeenNthCalledWith(1, 'docker', [
      'inspect',
      TEST_DB_CONTAINER_NAME,
    ]);
    expect(runCommand).toHaveBeenNthCalledWith(2, 'pnpm', ['db:test:up']);
    expect(runCommand).toHaveBeenNthCalledWith(3, 'docker', [
      'inspect',
      '--format',
      '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}',
      TEST_DB_CONTAINER_NAME,
    ]);
  });

  it('reuses an existing healthy test DB container instead of running docker compose', async () => {
    const runCommand = createCommandRunner([
      { exitCode: 0 },
      { exitCode: 0 },
      { exitCode: 0, stdout: 'healthy\n' },
    ]);

    await expect(ensureLocalTestDatabase({ runCommand })).resolves.toBe(
      'reused',
    );

    expect(runCommand).toHaveBeenNthCalledWith(1, 'docker', [
      'inspect',
      TEST_DB_CONTAINER_NAME,
    ]);
    expect(runCommand).toHaveBeenNthCalledWith(2, 'docker', [
      'start',
      TEST_DB_CONTAINER_NAME,
    ]);
    expect(runCommand).toHaveBeenNthCalledWith(3, 'docker', [
      'inspect',
      '--format',
      '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}',
      TEST_DB_CONTAINER_NAME,
    ]);
    expect(runCommand).not.toHaveBeenCalledWith('pnpm', ['db:test:up']);
  });

  it('waits until an existing test DB container becomes healthy', async () => {
    const sleep = vi.fn(async () => {});
    const runCommand = createCommandRunner([
      { exitCode: 0 },
      { exitCode: 0 },
      { exitCode: 0, stdout: 'starting\n' },
      { exitCode: 0, stdout: 'healthy\n' },
    ]);

    await expect(ensureLocalTestDatabase({ runCommand, sleep })).resolves.toBe(
      'reused',
    );

    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('throws the underlying command stderr when startup fails', async () => {
    const runCommand = createCommandRunner([
      { exitCode: 0 },
      { exitCode: 2, stderr: 'docker start failed' },
    ]);

    await expect(ensureLocalTestDatabase({ runCommand })).rejects.toThrow(
      `Command failed: docker start ${TEST_DB_CONTAINER_NAME}\ndocker start failed`,
    );
  });

  it('fails when an existing test DB container never becomes healthy', async () => {
    const sleep = vi.fn(async () => {});
    const runCommand = createCommandRunner([
      { exitCode: 0 },
      { exitCode: 0 },
      ...Array.from({ length: 60 }, () => ({
        exitCode: 0,
        stdout: 'starting\n',
      })),
    ]);

    await expect(
      ensureLocalTestDatabase({ runCommand, sleep }),
    ).rejects.toThrow(
      `Local test database container "${TEST_DB_CONTAINER_NAME}" did not become healthy.`,
    );
    expect(sleep).toHaveBeenCalledTimes(59);
  });
});

describe('runTestDbCommand', () => {
  it('executes a command and captures stdout', async () => {
    await expect(
      runTestDbCommand(process.execPath, [
        '-e',
        'process.stdout.write("healthy")',
      ]),
    ).resolves.toEqual({
      exitCode: 0,
      stdout: 'healthy',
      stderr: '',
    });
  });
});

describe('runEnsureLocalTestDatabase', () => {
  it('logs the ensure result', async () => {
    const ensureDatabase = vi.fn(async () => 'reused' as const);
    const log = vi.fn();
    const error = vi.fn();

    await expect(
      runEnsureLocalTestDatabase({ ensureDatabase, log, error }),
    ).resolves.toBe(0);

    expect(log).toHaveBeenCalledWith('[local-e2e] Local test database reused.');
    expect(error).not.toHaveBeenCalled();
  });

  it('reports failure and returns a process exit code', async () => {
    const ensureDatabase = vi.fn(async () => {
      throw new Error('docker unavailable');
    });
    const log = vi.fn();
    const error = vi.fn();

    await expect(
      runEnsureLocalTestDatabase({ ensureDatabase, log, error }),
    ).resolves.toBe(1);

    expect(log).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('docker unavailable');
  });
});
