import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { TestProject } from 'vitest/node';
import type { LiveTestDoubleRatchetIssues } from './test-double-fidelity-live-scan';

const LIVE_SCAN_PROCESS_TIMEOUT_MS = 14_000;

declare module 'vitest' {
  export interface ProvidedContext {
    testDoubleRatchetIssues: LiveTestDoubleRatchetIssues;
  }
}

function readLiveTestDoubleRatchetIssues(): LiveTestDoubleRatchetIssues {
  const output = execFileSync(
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

export default function setup(project: TestProject): void {
  project.provide('testDoubleRatchetIssues', readLiveTestDoubleRatchetIssues());
}
