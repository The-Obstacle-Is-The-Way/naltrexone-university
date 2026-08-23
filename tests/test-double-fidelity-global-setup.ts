import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { LiveTestDoubleRatchetIssues } from './test-double-fidelity-live-scan';

// Exact-head CI 32659858531 measured the scan beyond the former 14-second
// bound; 30 seconds is over twice that observed healthy workload while still
// failing closed on a wedged subprocess.
export const LIVE_SCAN_PROCESS_TIMEOUT_MS = 30_000;

declare module 'vitest' {
  export interface ProvidedContext {
    testDoubleRatchetIssues: LiveTestDoubleRatchetIssues;
  }
}

type LiveScanProcessRunner = (
  executable: string,
  args: string[],
  options: { cwd: string; encoding: 'utf8'; timeout: number },
) => string;

type LiveScanProject = {
  provide(
    key: 'testDoubleRatchetIssues',
    value: LiveTestDoubleRatchetIssues,
  ): void;
};

export function readLiveTestDoubleRatchetIssues(
  runProcess: LiveScanProcessRunner = execFileSync,
): LiveTestDoubleRatchetIssues {
  const output = runProcess(
    process.execPath,
    [
      '--import=tsx',
      path.resolve(process.cwd(), 'tests/test-double-fidelity-live-scan.ts'),
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: LIVE_SCAN_PROCESS_TIMEOUT_MS,
    },
  );

  return JSON.parse(output) as LiveTestDoubleRatchetIssues;
}

export default function setup(
  project: LiveScanProject,
  readIssues: () => LiveTestDoubleRatchetIssues = readLiveTestDoubleRatchetIssues,
): void {
  project.provide('testDoubleRatchetIssues', readIssues());
}
