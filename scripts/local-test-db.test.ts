import { describe, expect, it, vi } from 'vitest';
import { runEnsureLocalTestDatabase } from './ensure-local-test-db';
import {
  ensureLocalTestDatabase,
  runTestDbCommand,
  type TestDbCommandOptions,
  type TestDbCommandRunner,
} from './local-test-db';
import { resolveLocalTestTarget } from './resolve-local-test-target';

function createCommandRunner(
  results: Array<{ exitCode: number; stdout?: string; stderr?: string }>,
): TestDbCommandRunner {
  const queue = [...results];

  return vi.fn(
    async (
      _command: string,
      _args: string[],
      _options?: TestDbCommandOptions,
    ) => {
      const next = queue.shift();
      if (!next) {
        throw new Error('Unexpected command call.');
      }

      return {
        exitCode: next.exitCode,
        stdout: next.stdout ?? '',
        stderr: next.stderr ?? '',
      };
    },
  );
}

function expectCommandCall(
  runCommand: TestDbCommandRunner,
  callNumber: number,
  args: string[],
): void {
  const call = vi.mocked(runCommand).mock.calls[callNumber - 1];

  expect(call?.[0]).toBe('docker');
  expect(call?.[1]).toEqual(args);
}

describe('ensureLocalTestDatabase', () => {
  const target = resolveLocalTestTarget({
    cwd: '/repo/app',
    env: {
      LOCAL_TEST_INSTANCE: 'dbtest',
      DB_TEST_PORT: '55437',
    },
  });

  it('starts docker compose when the resolved Compose service does not exist', async () => {
    const runCommand = createCommandRunner([
      { exitCode: 0, stdout: '\n' },
      { exitCode: 0 },
      { exitCode: 0, stdout: 'container_id\n' },
      { exitCode: 0, stdout: 'healthy\n' },
    ]);

    await expect(ensureLocalTestDatabase({ runCommand, target })).resolves.toBe(
      'created',
    );

    expect(runCommand).toHaveBeenCalledTimes(4);
    expectCommandCall(runCommand, 1, [
      'compose',
      '-p',
      'naltrexone-test-dbtest',
      'ps',
      '-aq',
      'db',
    ]);
    expectCommandCall(runCommand, 2, [
      'compose',
      '-p',
      'naltrexone-test-dbtest',
      'up',
      '-d',
      '--wait',
      'db',
    ]);
    expectCommandCall(runCommand, 3, [
      'compose',
      '-p',
      'naltrexone-test-dbtest',
      'ps',
      '-q',
      'db',
    ]);
    expectCommandCall(runCommand, 4, [
      'inspect',
      '--format',
      '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}',
      'container_id',
    ]);
  });

  it('passes resolver-derived environment to every docker command', async () => {
    const runCommand = createCommandRunner([
      { exitCode: 0, stdout: '\n' },
      { exitCode: 0 },
      { exitCode: 0, stdout: 'container_id\n' },
      { exitCode: 0, stdout: 'healthy\n' },
    ]);

    await expect(ensureLocalTestDatabase({ runCommand, target })).resolves.toBe(
      'created',
    );

    for (const call of vi.mocked(runCommand).mock.calls) {
      expect(call[2]?.env).toMatchObject({
        COMPOSE_PROJECT_NAME: 'naltrexone-test-dbtest',
        DB_TEST_PORT: '55437',
        DATABASE_URL:
          'postgresql://postgres:postgres@127.0.0.1:55437/addiction_boards_test',
        LOCAL_TEST_INSTANCE: 'dbtest',
        NEXT_PUBLIC_APP_URL: target.appUrl,
        PORT: target.appPort,
      });
    }
  });

  it('reuses an existing resolved Compose service instead of inspecting a global container name', async () => {
    const runCommand = createCommandRunner([
      { exitCode: 0, stdout: 'old_container_id\n' },
      { exitCode: 0 },
      { exitCode: 0, stdout: 'new_container_id\n' },
      { exitCode: 0, stdout: 'healthy\n' },
    ]);

    await expect(ensureLocalTestDatabase({ runCommand, target })).resolves.toBe(
      'reused',
    );

    expectCommandCall(runCommand, 1, [
      'compose',
      '-p',
      'naltrexone-test-dbtest',
      'ps',
      '-aq',
      'db',
    ]);
    expectCommandCall(runCommand, 2, [
      'compose',
      '-p',
      'naltrexone-test-dbtest',
      'up',
      '-d',
      '--wait',
      'db',
    ]);
    expectCommandCall(runCommand, 3, [
      'compose',
      '-p',
      'naltrexone-test-dbtest',
      'ps',
      '-q',
      'db',
    ]);
    expectCommandCall(runCommand, 4, [
      'inspect',
      '--format',
      '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}',
      'new_container_id',
    ]);
    expect(runCommand).not.toHaveBeenCalledWith('pnpm', ['db:test:up']);
    expect(JSON.stringify(vi.mocked(runCommand).mock.calls)).not.toContain(
      'naltrexone-test-db"',
    );
  });

  it('waits until an existing test DB container becomes healthy', async () => {
    const sleep = vi.fn(async () => {});
    const runCommand = createCommandRunner([
      { exitCode: 0, stdout: 'container_id\n' },
      { exitCode: 0 },
      { exitCode: 0, stdout: 'container_id\n' },
      { exitCode: 0, stdout: 'starting\n' },
      { exitCode: 0, stdout: 'container_id\n' },
      { exitCode: 0, stdout: 'healthy\n' },
    ]);

    await expect(
      ensureLocalTestDatabase({ runCommand, sleep, target }),
    ).resolves.toBe('reused');

    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('waits until the resolved Compose service reports a container id', async () => {
    const sleep = vi.fn(async () => {});
    const runCommand = createCommandRunner([
      { exitCode: 0, stdout: '\n' },
      { exitCode: 0 },
      { exitCode: 0, stdout: '\n' },
      { exitCode: 0, stdout: 'container_id\n' },
      { exitCode: 0, stdout: 'healthy\n' },
    ]);

    await expect(
      ensureLocalTestDatabase({ runCommand, sleep, target }),
    ).resolves.toBe('created');

    expect(sleep).toHaveBeenCalledTimes(1);
    expectCommandCall(runCommand, 3, [
      'compose',
      '-p',
      'naltrexone-test-dbtest',
      'ps',
      '-q',
      'db',
    ]);
    expectCommandCall(runCommand, 4, [
      'compose',
      '-p',
      'naltrexone-test-dbtest',
      'ps',
      '-q',
      'db',
    ]);
  });

  it('throws the underlying command stderr when startup fails', async () => {
    const runCommand = createCommandRunner([
      { exitCode: 0, stdout: 'container_id\n' },
      { exitCode: 2, stderr: 'docker compose up failed' },
    ]);

    await expect(
      ensureLocalTestDatabase({ runCommand, target }),
    ).rejects.toThrow(
      'Command failed: docker compose -p naltrexone-test-dbtest up -d --wait db\ndocker compose up failed',
    );
  });

  it('fails when an existing test DB container never becomes healthy', async () => {
    const sleep = vi.fn(async () => {});
    const runCommand = createCommandRunner([
      { exitCode: 0, stdout: 'container_id\n' },
      { exitCode: 0 },
      ...Array.from({ length: 60 }, () => [
        { exitCode: 0, stdout: 'container_id\n' },
        { exitCode: 0, stdout: 'starting\n' },
      ]).flat(),
    ]);

    await expect(
      ensureLocalTestDatabase({ runCommand, sleep, target }),
    ).rejects.toThrow(
      'Local test database service "db" in Compose project "naltrexone-test-dbtest" did not become healthy.',
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

  it('passes explicit environment overrides to execFile', async () => {
    await expect(
      runTestDbCommand(
        process.execPath,
        ['-e', 'process.stdout.write(process.env.DB_TEST_PORT ?? "missing")'],
        {
          env: {
            ...process.env,
            DB_TEST_PORT: '55437',
          },
        },
      ),
    ).resolves.toMatchObject({
      exitCode: 0,
      stdout: '55437',
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
