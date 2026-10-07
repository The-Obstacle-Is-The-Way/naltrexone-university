import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// DEBT-508: concurrent E2E runs must not change each other's Stripe test
// customer. Each workflow lane names its own owner; CI names one per run
// attempt, since a re-run keeps its run_id.

type Workflow = {
  jobs?: Record<
    string,
    { steps?: { name?: string; env?: Record<string, string> }[] }
  >;
};

function stepOwner(path: string, stepName: string): string | undefined {
  const workflow = parse(readFileSync(path, 'utf8')) as Workflow;
  const steps = Object.values(workflow.jobs ?? {}).flatMap(
    (job) => job.steps ?? [],
  );
  const matches = steps.filter((step) => step.name === stepName);
  if (matches.length !== 1) {
    throw new Error(`Expected one "${stepName}" step in ${path}`);
  }
  return matches[0]?.env?.E2E_STRIPE_OWNER;
}

describe('E2E test identity per workflow lane', () => {
  it('tags each required CI E2E run attempt with its own Stripe customer owner', () => {
    expect(stepOwner('.github/workflows/ci.yml', 'E2E smoke')).toBe(
      `github-ci-\${{ github.run_id }}-\${{ github.run_attempt }}`,
    );
  });
});
