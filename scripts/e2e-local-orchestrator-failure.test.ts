import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '../tests/shared/process-env';
import { spawnCommand } from './e2e-local-orchestrator';

async function withRunningCommand(
  check: (fixture: {
    signals: EventEmitter;
    result: Promise<unknown>;
  }) => Promise<void>,
) {
  const originalEnv = snapshotProcessEnv();
  const directory = await mkdtemp(path.join(tmpdir(), 'e2e-runner-failure-'));
  const ready = path.join(directory, 'ready');
  const signals = new EventEmitter();
  let pid: number | undefined;
  const result = spawnCommand(
    {
      label: 'failure fixture',
      command: process.execPath,
      args: [
        '-e',
        `process.on('SIGTERM', () => {});
         require('node:fs').writeFileSync(${JSON.stringify(ready)}, String(process.pid));
         setInterval(() => {}, 1000);`,
      ],
      env: {},
    },
    signals,
    50,
  ).catch((error: unknown) => error);
  try {
    await vi.waitFor(async () => {
      pid = Number(await readFile(ready, 'utf8'));
      expect(pid).toBeGreaterThan(0);
    });
    await check({ signals, result });
    expect(signals.listenerCount('SIGINT')).toBe(0);
    expect(signals.listenerCount('SIGTERM')).toBe(0);
  } finally {
    vi.unstubAllEnvs();
    restoreProcessEnv(originalEnv);
    vi.restoreAllMocks();
    if (pid !== undefined) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // The runner may already have terminated this owned fixture.
      }
    }
    await rm(directory, { recursive: true, force: true });
  }
}

describe('local E2E command failures', () => {
  it('removes interruption listeners after a successful command', async () => {
    const signals = new EventEmitter();
    await expect(
      spawnCommand(
        {
          label: 'success',
          command: process.execPath,
          args: ['-e', ''],
          env: {},
        },
        signals,
      ),
    ).resolves.toBeUndefined();
    expect(signals.listenerCount('SIGINT')).toBe(0);
    expect(signals.listenerCount('SIGTERM')).toBe(0);
  });

  it('rejects a spawn failure and removes interruption listeners', async () => {
    const signals = new EventEmitter();
    await expect(
      spawnCommand(
        {
          label: 'missing executable',
          command: '/nonexistent/e2e-fixture',
          args: [],
          env: {},
        },
        signals,
      ),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    expect(signals.listenerCount('SIGINT')).toBe(0);
    expect(signals.listenerCount('SIGTERM')).toBe(0);
  });

  it('preserves a process-discovery failure instead of reporting interruption success', async () => {
    await withRunningCommand(async ({ signals, result }) => {
      vi.stubEnv('PATH', '/nonexistent/e2e-fixture');
      signals.emit('SIGTERM');
      expect(await result).toMatchObject({ code: 'ENOENT', path: 'ps' });
    });
  });

  it.each(['SIGTERM', 'SIGKILL'] as const)(
    'preserves an operating-system %s failure and removes interruption listeners',
    async (failedSignal) => {
      await withRunningCommand(async ({ signals, result }) => {
        const failure = Object.assign(new Error('signal permission denied'), {
          code: 'EPERM',
        });
        const kill = process.kill.bind(process);
        // Error translation only: real child/process discovery; inject the OS
        // error that cannot safely be forced on a process owned by this test.
        vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
          if (pid < 0 && signal === failedSignal) throw failure;
          return kill(pid, signal);
        });
        signals.emit('SIGTERM');
        expect(await result).toBe(failure);
      });
    },
  );
});
