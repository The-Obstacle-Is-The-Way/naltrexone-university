import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CI_WORKFLOW_PATH = '.github/workflows/ci.yml';
const HUMAN_SAME_REPO_PR_CONDITION =
  "github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository";
const DEPENDABOT_ACTOR_GUARD = "github.actor != 'dependabot[bot]'";

function readCiWorkflow(): string {
  return readFileSync(CI_WORKFLOW_PATH, 'utf8');
}

function findStepBlock(workflow: string, stepName: string): string {
  const stepStart = workflow.indexOf(`- name: ${stepName}`);

  if (stepStart === -1) {
    throw new Error(`Missing CI workflow step: ${stepName}`);
  }

  const nextStepStart = workflow.indexOf('\n      - name:', stepStart + 1);

  if (nextStepStart === -1) {
    return workflow.slice(stepStart);
  }

  return workflow.slice(stepStart, nextStepStart);
}

describe('CI workflow', () => {
  it.each(['Validate E2E credential inputs', 'E2E smoke'])(
    'does not run %s on Dependabot pull requests because secrets are unavailable',
    (stepName) => {
      const stepBlock = findStepBlock(readCiWorkflow(), stepName);

      expect(stepBlock).toContain("github.event_name == 'push'");
      expect(stepBlock).toContain(HUMAN_SAME_REPO_PR_CONDITION);
      expect(stepBlock).toContain(DEPENDABOT_ACTOR_GUARD);
    },
  );

  it('fails closed when the paid annual E2E price is missing or dummy', () => {
    const stepBlock = findStepBlock(
      readCiWorkflow(),
      'Validate E2E credential inputs',
    );

    expect(stepBlock).toContain(
      'require_non_empty NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL',
    );
    expect(stepBlock).toContain(
      'require_not_dummy NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL price_dummy_annual',
    );
  });
});
