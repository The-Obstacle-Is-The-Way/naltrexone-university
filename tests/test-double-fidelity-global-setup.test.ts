import { describe, expect, it } from 'vitest';
import {
  LIVE_SCAN_PROCESS_TIMEOUT_MS,
  readLiveTestDoubleRatchetIssues,
  default as setup,
} from './test-double-fidelity-global-setup';

const EXPECTED_ISSUES = {
  ownCodeModuleMocks: ['module growth'],
  unknownDoubleCasts: ['cast growth'],
  handRolledPortDoubles: ['port growth'],
};

describe('test-double fidelity global setup', () => {
  it('bounds the live scan with headroom above the measured CI duration', () => {
    expect(LIVE_SCAN_PROCESS_TIMEOUT_MS).toBe(30_000);
  });

  it('runs the live scan in a bounded child and parses its issue lists', () => {
    const calls: Array<{
      executable: string;
      args: string[];
      options: { cwd: string; encoding: 'utf8'; timeout: number };
    }> = [];
    const runProcess = (
      executable: string,
      args: string[],
      options: { cwd: string; encoding: 'utf8'; timeout: number },
    ): string => {
      calls.push({ executable, args, options });
      return JSON.stringify(EXPECTED_ISSUES);
    };

    const issues = readLiveTestDoubleRatchetIssues(runProcess);

    expect(issues).toEqual(EXPECTED_ISSUES);
    expect(calls).toEqual([
      {
        executable: process.execPath,
        args: [
          '--import=tsx',
          expect.stringMatching(/tests\/test-double-fidelity-live-scan\.ts$/),
        ],
        options: {
          cwd: process.cwd(),
          encoding: 'utf8',
          timeout: LIVE_SCAN_PROCESS_TIMEOUT_MS,
        },
      },
    ]);
  });

  it('provides the live scan issues to the Vitest project', () => {
    const provided: Array<{
      key: string;
      value: typeof EXPECTED_ISSUES;
    }> = [];
    const project = {
      provide(key: string, value: typeof EXPECTED_ISSUES): void {
        provided.push({ key, value });
      },
    };

    setup(project, () => EXPECTED_ISSUES);

    expect(provided).toEqual([
      { key: 'testDoubleRatchetIssues', value: EXPECTED_ISSUES },
    ]);
  });
});
