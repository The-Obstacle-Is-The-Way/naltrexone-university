import { describe, expect, it, vi } from 'vitest';
import {
  ensureLocalTestDatabase,
  TEST_DB_CONTAINER_NAME,
  type TestDbCommandRunner,
} from './local-test-db';

function createCommandRunner(
  results: Array<{ exitCode: number; stdout?: string }>,
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
      stderr: '',
    };
  });
}

describe('ensureLocalTestDatabase', () => {
  it('starts docker compose when the named test DB container does not exist', async () => {
    const runCommand = createCommandRunner([{ exitCode: 1 }, { exitCode: 0 }]);

    await expect(ensureLocalTestDatabase({ runCommand })).resolves.toBe(
      'created',
    );

    expect(runCommand).toHaveBeenCalledTimes(2);
    expect(runCommand).toHaveBeenNthCalledWith(1, 'docker', [
      'inspect',
      TEST_DB_CONTAINER_NAME,
    ]);
    expect(runCommand).toHaveBeenNthCalledWith(2, 'pnpm', ['db:test:up']);
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
});
