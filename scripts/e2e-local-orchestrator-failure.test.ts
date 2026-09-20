import { spawn } from 'node:child_process';
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
    pids: number[];
  }) => Promise<void>,
  { detachedDescendant = false } = {},
) {
  const originalEnv = snapshotProcessEnv();
  const directory = await mkdtemp(path.join(tmpdir(), 'e2e-runner-failure-'));
  const ready = path.join(directory, 'ready');
  const signals = new EventEmitter();
  let pids: number[] = [];
  const result = spawnCommand(
    {
      label: 'failure fixture',
      command: process.execPath,
      args: [
        '-e',
        `process.on('SIGTERM', () => {});
         const child = require('node:child_process').spawn(process.execPath,
           ['-e', "process.on('SIGTERM', () => {}); process.send('ready'); setInterval(() => {}, 1000);"],
           { detached: ${detachedDescendant}, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
         child.on('message', () => require('node:fs').writeFileSync(${JSON.stringify(ready)}, JSON.stringify([process.pid, child.pid])));`,
      ],
      env: {},
    },
    signals,
    50,
  ).catch((error: unknown) => error);
  try {
    await vi.waitFor(async () => {
      pids = JSON.parse(await readFile(ready, 'utf8')) as number[];
      expect(pids).toHaveLength(2);
    });
    await check({ signals, result, pids });
    expect(signals.listenerCount('SIGINT')).toBe(0);
    expect(signals.listenerCount('SIGTERM')).toBe(0);
  } finally {
    vi.unstubAllEnvs();
    restoreProcessEnv(originalEnv);
    vi.restoreAllMocks();
    for (const pid of pids) {
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

  it('kills the known root group when process discovery fails', async () => {
    await withRunningCommand(async ({ signals, result, pids }) => {
      vi.stubEnv('PATH', '/nonexistent/e2e-fixture');
      signals.emit('SIGTERM');
      await result;
      await vi.waitFor(() => {
        for (const pid of pids) {
          expect(() => process.kill(pid, 0)).toThrow();
        }
      });
    });
  });

  it('reports root-group cleanup failure when process discovery also failed', async () => {
    await withRunningCommand(async ({ signals, result }) => {
      vi.stubEnv('PATH', '/nonexistent/e2e-fixture');
      const failure = Object.assign(new Error('group cleanup denied'), {
        code: 'EPERM',
      });
      const kill = process.kill.bind(process);
      vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
        if (pid < 0 && signal === 'SIGKILL') throw failure;
        return kill(pid, signal);
      });
      signals.emit('SIGTERM');
      expect(await result).toBe(failure);
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

  it.each(['SIGTERM', 'SIGKILL', 'both'] as const)(
    'cleans later owned groups and preserves the first error after root-group signal failures (%s)',
    async (failedSignal) => {
      await withRunningCommand(
        async ({ signals, result, pids }) => {
          const [rootPid, detachedPid] = pids;
          if (rootPid === undefined || detachedPid === undefined)
            throw new Error('Expected the parent and detached fixture PIDs.');
          const initialFailure = Object.assign(
            new Error('initial signal denied'),
            {
              code: 'EPERM',
            },
          );
          const escalationFailure = Object.assign(
            new Error('escalation denied'),
            {
              code: 'EPERM',
            },
          );
          const kill = process.kill.bind(process);
          // Only the root group's OS error is injected; the independently
          // signalable detached child still receives real kernel signals.
          const signalSpy = vi
            .spyOn(process, 'kill')
            .mockImplementation((pid, signal) => {
              if (pid === -rootPid) {
                if (signal === 'SIGTERM' && failedSignal !== 'SIGKILL')
                  throw initialFailure;
                if (signal === 'SIGKILL' && failedSignal !== 'SIGTERM')
                  throw escalationFailure;
              }
              return kill(pid, signal);
            });
          const unrelated = spawn(process.execPath, [
            '-e',
            'setInterval(() => {}, 1000)',
          ]);
          try {
            signals.emit('SIGTERM');
            expect(await result).toBe(
              failedSignal === 'SIGKILL' ? escalationFailure : initialFailure,
            );
            expect
              .soft(signalSpy)
              .toHaveBeenCalledWith(-detachedPid, 'SIGTERM');
            expect
              .soft(signalSpy)
              .toHaveBeenCalledWith(-detachedPid, 'SIGKILL');
            await vi.waitFor(() => {
              expect(() => kill(detachedPid, 0)).toThrow();
            });
            const unrelatedPid = unrelated.pid;
            if (unrelatedPid === undefined)
              throw new Error('Expected the unrelated fixture PID.');
            expect(() => kill(unrelatedPid, 0)).not.toThrow();
          } finally {
            unrelated.kill('SIGKILL');
          }
        },
        { detachedDescendant: true },
      );
    },
  );
});
