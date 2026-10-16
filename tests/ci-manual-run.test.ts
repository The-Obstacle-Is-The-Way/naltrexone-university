import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// DEBT-523: CI's manual run on main, for a push GitHub dropped.
const CI_WORKFLOW_PATH = '.github/workflows/ci.yml';
const REPOSITORY = 'The-Obstacle-Is-The-Way/naltrexone-university';
const REFUSAL_STEP = "Refuse a manual run off main's dropped commit";
const DROPPED_COMMIT = '2f1278a1d0e64e1b8c4f7a9e3b5d6c8f0a1b2c3d';
const NEWER_MAIN_HEAD = '3a4c5d55e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1';
// Stands in for git: answers only a read of this repository's main ref, with
// FAKE_MAIN_HEAD, and fails like an unreachable remote when that is empty.
const FAKE_GIT = `#!/bin/sh
if [ "$*" = "ls-remote https://github.com/${REPOSITORY}.git refs/heads/main" ] && [ -n "$FAKE_MAIN_HEAD" ]; then
  printf '%s\\trefs/heads/main\\n' "$FAKE_MAIN_HEAD"
  exit 0
fi
echo "fatal: unexpected git call: $*" >&2
exit 128
`;

type WorkflowStep = {
  'timeout-minutes'?: number;
  env?: Record<string, string>;
  if?: string;
  name?: string;
  run?: string;
};

type CiWorkflow = {
  concurrency?: Record<string, string>;
  jobs?: { test?: { steps?: WorkflowStep[] } };
  on?: Record<string, unknown>;
};

function readCiWorkflow(): CiWorkflow {
  return parse(readFileSync(CI_WORKFLOW_PATH, 'utf8')) as CiWorkflow;
}

function findRefusalStep(): WorkflowStep {
  const step = readCiWorkflow().jobs?.test?.steps?.find(
    (candidate) => candidate.name === REFUSAL_STEP,
  );
  if (!step) throw new Error(`Missing CI workflow step: ${REFUSAL_STEP}`);
  return step;
}

describe("CI's manual run on main", () => {
  it('runs by hand only on the main commit it names, so a push GitHub drops can still get a full CI run', () => {
    const workflow = readCiWorkflow();
    const refusal = findRefusalStep();

    expect(Object.keys(workflow.on ?? {})).toEqual([
      'pull_request',
      'push',
      'workflow_dispatch',
    ]);
    expect(workflow.on?.workflow_dispatch).toMatchObject({
      inputs: { sha: { required: true, type: 'string' } },
    });
    expect(refusal.if).toBe("github.event_name == 'workflow_dispatch'");
    expect(refusal.env).toEqual({
      GIT_TERMINAL_PROMPT: '0',
      REQUESTED_SHA: `\${{ inputs.sha }}`,
    });
    expect(refusal.run).not.toContain('${{');
    // The read of main's head must not wait out the job's 60 minutes.
    expect(refusal['timeout-minutes']).toBe(2);
    expect(workflow.jobs?.test?.steps?.[0]?.name).toBe(REFUSAL_STEP);
  });

  it('lets a manual run wait for a push run on main instead of cancelling it', () => {
    expect(readCiWorkflow().concurrency).toEqual({
      group: `\${{ github.workflow }}-\${{ github.head_ref || github.ref }}`,
      'cancel-in-progress': `\${{ github.event_name != 'workflow_dispatch' }}`,
    });
  });

  describe('its refusal step', () => {
    let fakeBin = '';

    beforeAll(() => {
      fakeBin = mkdtempSync(join(tmpdir(), 'ci-refusal-'));
      writeFileSync(join(fakeBin, 'git'), FAKE_GIT, { mode: 0o755 });
    });

    afterAll(() => {
      rmSync(fakeBin, { recursive: true, force: true });
    });

    function runRefusal({
      ref = 'refs/heads/main',
      sha = DROPPED_COMMIT,
      mainHead = DROPPED_COMMIT,
    }: {
      ref?: string;
      sha?: string;
      mainHead?: string;
    }) {
      // A run step with no shell runs as `bash -e` on Linux runners.
      const result = spawnSync(
        'bash',
        ['-e', '-c', findRefusalStep().run ?? ''],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
            GITHUB_REF: ref,
            GITHUB_SHA: sha,
            GITHUB_SERVER_URL: 'https://github.com',
            GITHUB_REPOSITORY: REPOSITORY,
            REQUESTED_SHA: DROPPED_COMMIT,
            FAKE_MAIN_HEAD: mainHead,
          },
        },
      );
      return { status: result.status, output: result.stdout + result.stderr };
    }

    it("lets the run go on when it is on main and main's head is still the requested commit", () => {
      expect(runRefusal({}).status).toBe(0);
    });

    it('refuses a run dispatched on another branch', () => {
      expect(runRefusal({ ref: 'refs/heads/dev' }).status).toBe(1);
    });

    it('refuses a run whose commit is not the requested one', () => {
      expect(runRefusal({ sha: NEWER_MAIN_HEAD }).status).toBe(1);
    });

    it('refuses once main has moved on after the dispatch', () => {
      const { status, output } = runRefusal({ mainHead: NEWER_MAIN_HEAD });

      expect(status).toBe(1);
      expect(output).toContain(`main's head is ${NEWER_MAIN_HEAD}`);
    });

    it("refuses when main's head cannot be read", () => {
      expect(runRefusal({ mainHead: '' }).status).toBe(1);
    });
  });
});
