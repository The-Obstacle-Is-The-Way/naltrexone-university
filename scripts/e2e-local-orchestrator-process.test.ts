import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { spawnCommand } from './e2e-local-orchestrator';

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe('local E2E interruption', () => {
  it.each(['SIGINT', 'SIGTERM'] as const)(
    'terminates the active command and its descendants on %s, not unrelated processes',
    async (signal) => {
      const signals = new EventEmitter();
      const directory = await mkdtemp(path.join(tmpdir(), 'e2e-signal-'));
      const ready = path.join(directory, 'ready');
      const unrelated = spawn(process.execPath, [
        '-e',
        'setInterval(() => {}, 1000)',
      ]);
      let pids: number[] = [];
      const descendant = `process.on('SIGINT', () => {}); process.on('SIGTERM', () => {}); process.send('ready'); setInterval(() => {}, 1000);`;
      const parent = `const { spawn } = require('node:child_process');
        const child = spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
        child.on('message', () => require('node:fs').writeFileSync(${JSON.stringify(ready)}, JSON.stringify([process.pid, child.pid])));
        process.on('SIGINT', () => {}); process.on('SIGTERM', () => {});`;
      try {
        const run = spawnCommand(
          {
            label: 'signal fixture',
            command: process.execPath,
            args: ['-e', parent],
            env: {},
          },
          signals,
          100,
        );
        // Attach rejection handling before delivering the interruption.
        const result = run.catch((error: unknown) => error);
        await vi.waitFor(async () => {
          pids = JSON.parse(await readFile(ready, 'utf8')) as number[];
          expect(pids).toHaveLength(2);
        });
        const start = Date.now();
        expect(signals.listenerCount(signal)).toBe(1);
        signals.emit(signal);
        expect(await result).toEqual(
          expect.objectContaining({
            message: `Local E2E interrupted by ${signal}.`,
          }),
        );
        await vi.waitFor(() => {
          for (const pid of pids) expect(alive(pid)).toBe(false);
        });
        expect(Date.now() - start).toBeLessThan(2_000);
        expect(unrelated.pid && alive(unrelated.pid)).toBe(true);
        expect(signals.listenerCount('SIGINT')).toBe(0);
        expect(signals.listenerCount('SIGTERM')).toBe(0);
      } finally {
        for (const pid of pids) {
          try {
            process.kill(pid, 'SIGKILL');
          } catch {
            /* Fixture already exited. */
          }
        }
        unrelated.kill('SIGKILL');
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

  it('still kills a stubborn descendant after its parent exits successfully on interruption', async () => {
    const signals = new EventEmitter();
    const directory = await mkdtemp(path.join(tmpdir(), 'e2e-orphan-'));
    const ready = path.join(directory, 'ready');
    let pids: number[] = [];
    const descendant = `process.on('SIGTERM', () => {}); process.send('ready'); setInterval(() => {}, 1000);`;
    const parent = `const child = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
      child.on('message', () => require('node:fs').writeFileSync(${JSON.stringify(ready)}, JSON.stringify([process.pid, child.pid])));
      process.on('SIGTERM', () => process.exit(0));`;
    try {
      const result = spawnCommand(
        {
          label: 'orphan fixture',
          command: process.execPath,
          args: ['-e', parent],
          env: {},
        },
        signals,
        100,
      ).catch((error: unknown) => error);
      await vi.waitFor(async () => {
        pids = JSON.parse(await readFile(ready, 'utf8')) as number[];
        expect(pids).toHaveLength(2);
      });
      signals.emit('SIGTERM');
      expect(await result).toEqual(
        expect.objectContaining({
          message: 'Local E2E interrupted by SIGTERM.',
        }),
      );
      await vi.waitFor(() => {
        for (const pid of pids) expect(alive(pid)).toBe(false);
      });
    } finally {
      for (const pid of pids) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          /* Fixture already exited. */
        }
      }
      await rm(directory, { recursive: true, force: true });
    }
  });
});
