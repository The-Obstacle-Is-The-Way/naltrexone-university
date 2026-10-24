import { EventEmitter } from 'node:events';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  spawnVitest,
  terminateVitestProcessTree,
} from './run-stripe-provider-contracts';

describe('spawnVitest', () => {
  const childEnvironment = { PATH: process.env.PATH };
  const expectNoParentSignalListeners = (parentSignals: EventEmitter) => {
    expect(parentSignals.listenerCount('SIGINT')).toBe(0);
    expect(parentSignals.listenerCount('SIGTERM')).toBe(0);
  };
  // Readiness handshake: signal-forwarding cases must not race child startup
  // on a loaded runner, so the child announces readiness through a file.
  const waitForFile = async (filePath: string) => {
    const deadline = Date.now() + 4_000;
    for (;;) {
      try {
        await access(filePath);
        return;
      } catch (error) {
        // Only not-yet-written is retryable; permission or path-shape errors
        // are real test-environment failures and must surface immediately.
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        if (Date.now() > deadline) {
          throw new Error(`ready file never appeared: ${filePath}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
  };

  it('resolves for a successful child process', async () => {
    const parentSignals = new EventEmitter();

    await expect(
      spawnVitest(
        {
          command: process.execPath,
          args: ['-e', 'process.exit(0)'],
          env: childEnvironment,
        },
        5_000,
        parentSignals,
      ),
    ).resolves.toBeUndefined();
    expectNoParentSignalListeners(parentSignals);
  });

  it('reports a nonzero child exit without including environment values', async () => {
    await expect(
      spawnVitest(
        {
          command: process.execPath,
          args: ['-e', 'process.exit(7)'],
          env: { ...childEnvironment, STRIPE_SECRET_KEY: 'do_not_print' },
        },
        5_000,
        new EventEmitter(),
      ),
    ).rejects.toThrow(
      'STRIPE_PROVIDER_PROCESS_FAILED: Vitest ended with exit code 7',
    );
  });

  it('reports a child signal', async () => {
    await expect(
      spawnVitest(
        {
          command: process.execPath,
          args: ['-e', "process.kill(process.pid, 'SIGTERM')"],
          env: childEnvironment,
        },
        5_000,
        new EventEmitter(),
      ),
    ).rejects.toThrow(
      'STRIPE_PROVIDER_PROCESS_FAILED: Vitest ended with signal SIGTERM',
    );
  });

  it('classifies a child process that cannot start', async () => {
    const parentSignals = new EventEmitter();

    await expect(
      spawnVitest(
        {
          command: path.join(process.cwd(), 'no-such-binary-debt468'),
          args: [],
          env: childEnvironment,
        },
        5_000,
        parentSignals,
      ),
    ).rejects.toThrow(
      'STRIPE_PROVIDER_PROCESS_START_FAILED: unable to start Vitest',
    );
    expectNoParentSignalListeners(parentSignals);
  });

  it('kills and classifies a child that exceeds its process budget', async () => {
    const parentSignals = new EventEmitter();

    await expect(
      spawnVitest(
        {
          command: process.execPath,
          args: ['-e', 'setTimeout(() => {}, 250)'],
          env: childEnvironment,
        },
        10,
        parentSignals,
      ),
    ).rejects.toThrow('STRIPE_PROVIDER_PROCESS_TIMEOUT: Vitest exceeded 10ms');
    expectNoParentSignalListeners(parentSignals);
  });

  it('uses direct-child termination on Windows', () => {
    const killChild = vi.fn(() => true);
    const killProcessGroup = vi.fn(() => true);

    terminateVitestProcessTree(
      { pid: 123, kill: killChild },
      'win32',
      killProcessGroup,
    );

    expect(killChild).toHaveBeenCalledWith('SIGKILL');
    expect(killProcessGroup).not.toHaveBeenCalled();
  });

  it('uses direct-child termination when the pid is unavailable', () => {
    const killChild = vi.fn(() => true);
    const killProcessGroup = vi.fn(() => true);

    terminateVitestProcessTree(
      { pid: undefined, kill: killChild },
      'linux',
      killProcessGroup,
    );

    expect(killChild).toHaveBeenCalledWith('SIGKILL');
    expect(killProcessGroup).not.toHaveBeenCalled();
  });

  it('signals the whole POSIX process group with the negative child pid', () => {
    const killChild = vi.fn(() => true);
    const killProcessGroup = vi.fn(() => true);

    terminateVitestProcessTree(
      { pid: 123, kill: killChild },
      'linux',
      killProcessGroup,
    );

    expect(killProcessGroup).toHaveBeenCalledWith(-123, 'SIGKILL');
    expect(killChild).not.toHaveBeenCalled();
  });

  it('falls back to the direct child when POSIX group signaling fails', () => {
    const killChild = vi.fn(() => true);
    const killProcessGroup = vi.fn(() => {
      throw new Error('process group already exited');
    });

    terminateVitestProcessTree(
      { pid: 123, kill: killChild },
      'darwin',
      killProcessGroup,
    );

    expect(killProcessGroup).toHaveBeenCalledWith(-123, 'SIGKILL');
    expect(killChild).toHaveBeenCalledWith('SIGKILL');
  });

  it.each(['SIGINT', 'SIGTERM'] as const)(
    'forwards parent %s to the child group and removes both listeners',
    async (signal) => {
      const parentSignals = new EventEmitter();
      const readyDirectory = await mkdtemp(
        path.join(tmpdir(), 'debt468-signal-ready-'),
      );
      const readyFile = path.join(readyDirectory, 'ready');
      try {
        const run = spawnVitest(
          {
            command: process.execPath,
            args: [
              '-e',
              `require('node:fs').writeFileSync(${JSON.stringify(readyFile)}, 'ready'); setInterval(() => {}, 1_000)`,
            ],
            env: childEnvironment,
          },
          5_000,
          parentSignals,
        );
        await waitForFile(readyFile);

        parentSignals.emit(signal);

        await expect(run).rejects.toThrow(
          `STRIPE_PROVIDER_PROCESS_FAILED: Vitest ended with signal ${signal}`,
        );
        expectNoParentSignalListeners(parentSignals);
      } finally {
        await rm(readyDirectory, { recursive: true, force: true });
      }
    },
  );

  // Windows terminates a child on kill('SIGTERM') without running its handler,
  // so the ignore-the-signal fixture is only constructible on POSIX platforms.
  it.skipIf(process.platform === 'win32')(
    'escalates to SIGKILL when the child ignores a forwarded signal',
    async () => {
      const parentSignals = new EventEmitter();
      const readyDirectory = await mkdtemp(
        path.join(tmpdir(), 'debt468-signal-ignore-'),
      );
      const readyFile = path.join(readyDirectory, 'ready');
      try {
        const run = spawnVitest(
          {
            command: process.execPath,
            args: [
              '-e',
              `process.on('SIGTERM', () => {}); process.on('SIGINT', () => {}); require('node:fs').writeFileSync(${JSON.stringify(readyFile)}, 'ready'); setInterval(() => {}, 1_000)`,
            ],
            env: childEnvironment,
          },
          10_000,
          parentSignals,
          200,
        );
        await waitForFile(readyFile);

        parentSignals.emit('SIGTERM');

        await expect(run).rejects.toThrow(
          'STRIPE_PROVIDER_PROCESS_FAILED: Vitest ended with signal SIGKILL',
        );
        expectNoParentSignalListeners(parentSignals);
      } finally {
        await rm(readyDirectory, { recursive: true, force: true });
      }
    },
  );
});
