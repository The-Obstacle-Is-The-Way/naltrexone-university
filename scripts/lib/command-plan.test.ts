import { describe, expect, it, vi } from 'vitest';
import { runCommandPlan, spawnCommand } from './command-plan';

describe('shared test-lane command runner', () => {
  it('stops at the failed preparation step', async () => {
    const labels: string[] = [];
    const failure = new Error('migration failed');
    await expect(
      runCommandPlan(
        ['start', 'migrate', 'seed', 'test'].map((label) => ({
          label,
          command: 'fixture',
          args: [],
        })),
        {
          env: {},
          runCommand: async ({ label }) => {
            labels.push(label);
            if (label === 'migrate') throw failure;
          },
        },
      ),
    ).rejects.toBe(failure);
    expect(labels).toEqual(['start', 'migrate']);
  });
  it('labels a real process as a test-lane step without claiming it is E2E', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await spawnCommand({
        label: 'Integration fixture',
        command: process.execPath,
        args: ['-e', 'process.exit(0)'],
        env: {},
      });
      expect(log).toHaveBeenCalledWith('[test-lane] Integration fixture');
    } finally {
      log.mockRestore();
    }
  });
});
