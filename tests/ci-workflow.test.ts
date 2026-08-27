import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const CI_WORKFLOW_PATH = '.github/workflows/ci.yml';
const CODECOV_CONFIG_PATH = 'codecov.yml';
const STRIPE_HOSTED_WORKFLOW_PATH =
  '.github/workflows/stripe-hosted-checkout-smoke.yml';
const STRIPE_PROVIDER_WORKFLOW_PATH =
  '.github/workflows/stripe-trial-clock-smoke.yml';
const HUMAN_SAME_REPO_PR_CONDITION =
  "github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository";
const DEPENDABOT_ACTOR_GUARD = "github.actor != 'dependabot[bot]'";
const PINNED_SETUP_NODE =
  'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020';
const PINNED_UPLOAD_ARTIFACT =
  'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a';
const PINNED_POSTGRES_16 =
  'postgres@sha256:e17e86066e5ef83e0952a9347f5c792b7ece00972e2aa787a6986f471b3dd3d5';
const WORKFLOW_PATHS = [
  CI_WORKFLOW_PATH,
  STRIPE_HOSTED_WORKFLOW_PATH,
  STRIPE_PROVIDER_WORKFLOW_PATH,
] as const;

type WorkflowStep = {
  env?: Record<string, string>;
  id?: string;
  if?: string;
  name?: string;
  run?: string;
  uses?: string;
  with?: Record<string, string>;
};

type WorkflowJob = {
  env?: Record<string, string>;
  steps?: WorkflowStep[];
  uses?: string;
};

type WorkflowDocument = {
  jobs?: Record<string, WorkflowJob>;
};

function readCiWorkflow(): string {
  return readFileSync(CI_WORKFLOW_PATH, 'utf8');
}

function readCodecovConfig(): string {
  return readFileSync(CODECOV_CONFIG_PATH, 'utf8');
}

function readStripeHostedWorkflow(): string {
  return readFileSync(STRIPE_HOSTED_WORKFLOW_PATH, 'utf8');
}

function readStripeProviderWorkflow(): string {
  return readFileSync(STRIPE_PROVIDER_WORKFLOW_PATH, 'utf8');
}

function readParsedWorkflow(filePath: string): WorkflowDocument {
  return parse(readFileSync(filePath, 'utf8')) as WorkflowDocument;
}

function findParsedStep(filePath: string, stepName: string): WorkflowStep {
  const jobs = readParsedWorkflow(filePath).jobs ?? {};
  const step = Object.values(jobs)
    .flatMap((job) => job.steps ?? [])
    .find((candidate) => candidate.name === stepName);

  if (!step) throw new Error(`Missing workflow step: ${filePath} ${stepName}`);
  return step;
}

function secretConsumers(filePath: string): string[] {
  return secretConsumersInWorkflow(readParsedWorkflow(filePath));
}

function secretConsumersInWorkflow(workflow: WorkflowDocument): string[] {
  const consumers = new Set<string>();
  const jobs = workflow.jobs ?? {};

  for (const [field, value] of Object.entries(workflow)) {
    if (field !== 'jobs') collectSecrets('$workflow', value, consumers);
  }
  for (const job of Object.values(jobs)) {
    for (const [field, value] of Object.entries(job)) {
      if (field !== 'steps') collectSecrets('$job', value, consumers);
    }
    for (const step of job.steps ?? []) {
      collectSecrets(step.name ?? '<unnamed>', step, consumers);
    }
  }

  return [...consumers].sort();
}

function actionUsesInWorkflow(workflow: WorkflowDocument): string[] {
  return Object.values(workflow.jobs ?? {}).flatMap((job) => [
    ...(job.uses ? [job.uses] : []),
    ...(job.steps ?? []).flatMap((step) => (step.uses ? [step.uses] : [])),
  ]);
}

function collectSecrets(
  consumer: string,
  value: unknown,
  consumers: Set<string>,
): void {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) return;
  for (const match of serialized.matchAll(/secrets\.([A-Za-z0-9_]+)/g)) {
    const secretName = match[1];
    if (secretName) consumers.add(`${consumer}:${secretName}`);
  }
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
  it('keeps the Dependabot E2E omission explicit pending the credential decision', () => {
    const stepBlock = findStepBlock(readCiWorkflow(), 'E2E smoke');

    expect(stepBlock).toContain("github.event_name == 'push'");
    expect(stepBlock).toContain(HUMAN_SAME_REPO_PR_CONDITION);
    expect(stepBlock).toContain(DEPENDABOT_ACTOR_GUARD);
  });

  it('bounds the Chromium-only Playwright browser installation step', () => {
    const stepBlock = findStepBlock(
      readCiWorkflow(),
      'Install Playwright browsers',
    );

    expect(stepBlock).toMatch(/timeout-minutes:\s*\d+/);
    expect(stepBlock).toContain(
      'bash scripts/ci/install-playwright-chromium.sh',
    );
  });

  it('runs the secret-free browser evidence on every CI trigger', () => {
    expect(
      findParsedStep(CI_WORKFLOW_PATH, 'Install Playwright browsers').if,
    ).toBeUndefined();
    expect(
      findParsedStep(CI_WORKFLOW_PATH, 'Browser tests with coverage').if,
    ).toBeUndefined();
  });

  it('deletes the duplicated bash credential validator', () => {
    expect(readCiWorkflow()).not.toContain(
      'name: Validate E2E credential inputs',
    );
  });

  it('reports evidence from actual step outcomes even after an earlier failure', () => {
    const evidenceSteps = [
      ['Unit tests with coverage', 'unit_tests'],
      ['Integration tests', 'integration_tests'],
      ['Browser tests with coverage', 'browser_tests'],
      ['Build', 'build'],
      ['E2E smoke', 'e2e_smoke'],
    ] as const;
    const summary = findParsedStep(CI_WORKFLOW_PATH, 'Evidence summary');

    expect(summary.if).toBe(`\${{ !cancelled() }}`);
    expect(summary.run).toContain('$GITHUB_STEP_SUMMARY');
    expect(summary.run).toMatch(/::warning(?: [^:]*)?::/);
    for (const [stepName, id] of evidenceSteps) {
      expect(findParsedStep(CI_WORKFLOW_PATH, stepName).id).toBe(id);
      expect(JSON.stringify(summary)).toContain(`steps.${id}.outcome`);
    }
  });

  it('exports existing-database opt-ins only to their matching CI lanes', () => {
    const integration = findParsedStep(CI_WORKFLOW_PATH, 'Integration tests');
    const e2e = findParsedStep(CI_WORKFLOW_PATH, 'E2E smoke');
    const hostedE2e = findParsedStep(
      STRIPE_HOSTED_WORKFLOW_PATH,
      'Run observational Stripe-hosted Checkout journeys',
    );

    expect(integration.env).toMatchObject({
      INTEGRATION_USE_EXISTING_DATABASE: 'true',
    });
    expect(integration.env).not.toHaveProperty('E2E_USE_EXISTING_DATABASE');
    expect(e2e.env).toMatchObject({ E2E_USE_EXISTING_DATABASE: 'true' });
    expect(e2e.env).not.toHaveProperty('INTEGRATION_USE_EXISTING_DATABASE');
    expect(hostedE2e.env).toMatchObject({
      E2E_USE_EXISTING_DATABASE: 'true',
    });
  });

  it('delegates skip policy to the parser-backed unit-lane scan', () => {
    const workflow = readCiWorkflow();

    expect(workflow).not.toContain('name: Enforce E2E skip policy');
    expect(workflow).not.toContain('grep -nH "test\\.skip("');
  });
});

describe('workflow secret scope', () => {
  it('finds secret expressions outside step and job env blocks', () => {
    const workflow = parse(`
env:
  WORKFLOW_TOKEN: \${{ secrets.workflow_token }}
jobs:
  delegated:
    if: \${{ secrets.JOB_GATE != '' }}
    uses: owner/repository/.github/workflows/reusable.yml@main
    with:
      token: \${{ secrets.JOB_INPUT }}
`) as WorkflowDocument;

    expect(secretConsumersInWorkflow(workflow)).toEqual(
      ['$job:JOB_GATE', '$job:JOB_INPUT', '$workflow:workflow_token'].sort(),
    );
  });

  it('gives each secret only to its documented consumer step', () => {
    expect(secretConsumers(CI_WORKFLOW_PATH)).toEqual(
      [
        '$job:NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
        'Build:NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
        'Build:NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL',
        'Build:NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY',
        'Build:NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
        'E2E smoke:CLERK_SECRET_KEY',
        'E2E smoke:E2E_CLERK_USER_PASSWORD',
        'E2E smoke:E2E_CLERK_USER_USERNAME',
        'E2E smoke:NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
        'E2E smoke:NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL',
        'E2E smoke:NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY',
        'E2E smoke:NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
        'E2E smoke:STRIPE_SECRET_KEY',
        'E2E smoke:STRIPE_WEBHOOK_SECRET',
        'Upload coverage to Codecov:CODECOV_TOKEN',
        'Validate header-safe CI secrets:CRON_SECRET',
      ].sort(),
    );
    expect(secretConsumers(STRIPE_HOSTED_WORKFLOW_PATH)).toEqual(
      [
        'Build:NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
        'Build:NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL',
        'Build:NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY',
        'Build:NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
        'Run observational Stripe-hosted Checkout journeys:CLERK_SECRET_KEY',
        'Run observational Stripe-hosted Checkout journeys:E2E_CLERK_USER_PASSWORD',
        'Run observational Stripe-hosted Checkout journeys:E2E_CLERK_USER_USERNAME',
        'Run observational Stripe-hosted Checkout journeys:NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
        'Run observational Stripe-hosted Checkout journeys:NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL',
        'Run observational Stripe-hosted Checkout journeys:NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY',
        'Run observational Stripe-hosted Checkout journeys:NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
        'Run observational Stripe-hosted Checkout journeys:STRIPE_SECRET_KEY',
        'Run observational Stripe-hosted Checkout journeys:STRIPE_WEBHOOK_SECRET',
      ].sort(),
    );
    expect(secretConsumers(STRIPE_PROVIDER_WORKFLOW_PATH)).toEqual(
      [
        'Run fail-closed Stripe provider contracts:NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY',
        'Run fail-closed Stripe provider contracts:STRIPE_SECRET_KEY',
      ].sort(),
    );
  });

  it('uses placeholders for server-only Build credentials', () => {
    for (const workflowPath of [
      CI_WORKFLOW_PATH,
      STRIPE_HOSTED_WORKFLOW_PATH,
    ]) {
      const build = findParsedStep(workflowPath, 'Build');

      expect(build.env?.CLERK_SECRET_KEY).toMatch(/^sk_test_\w+$/);
      expect(build.env?.STRIPE_SECRET_KEY).toMatch(/^sk_test_\w+$/);
      expect(build.env?.STRIPE_WEBHOOK_SECRET).toMatch(/^whsec_\w+$/);
      expect(build.env?.CLERK_SECRET_KEY).not.toContain('secrets.');
      expect(build.env?.STRIPE_SECRET_KEY).not.toContain('secrets.');
      expect(build.env?.STRIPE_WEBHOOK_SECRET).not.toContain('secrets.');
    }
  });
});

describe('workflow action pins', () => {
  it('finds reusable-workflow references at job level', () => {
    const workflow = parse(`
jobs:
  delegated:
    uses: owner/repository/.github/workflows/reusable.yml@main
`) as WorkflowDocument;

    expect(actionUsesInWorkflow(workflow)).toEqual([
      'owner/repository/.github/workflows/reusable.yml@main',
    ]);
  });

  it('pins every action to a full commit SHA with a version comment', () => {
    for (const workflowPath of WORKFLOW_PATHS) {
      const source = readFileSync(workflowPath, 'utf8');
      for (const uses of actionUsesInWorkflow(
        readParsedWorkflow(workflowPath),
      )) {
        expect(uses).toMatch(/^[^@]+@[a-f0-9]{40}$/);
        expect(source).toContain(`uses: ${uses} # v`);
      }
    }
  });
});

describe('Codecov configuration', () => {
  it('excludes Playwright test infrastructure from product coverage', () => {
    expect(readCodecovConfig()).toMatch(/ignore:\n\s+- ['"]tests\/e2e['"]/);
  });
});

describe('Stripe-hosted Checkout smoke workflow', () => {
  it('runs only on a schedule or explicit dispatch, never for pull requests or pushes', () => {
    const workflow = readStripeHostedWorkflow();
    const triggerBlock = workflow.slice(
      workflow.indexOf('on:'),
      workflow.indexOf('\npermissions:'),
    );

    expect(triggerBlock).toContain('schedule:');
    expect(triggerBlock).toContain('workflow_dispatch:');
    expect(triggerBlock).not.toContain('pull_request:');
    expect(triggerBlock).not.toContain('push:');
  });

  it('runs the observational hosted-Checkout drift detector daily', () => {
    const workflow = readStripeHostedWorkflow();
    const triggerBlock = workflow.slice(
      workflow.indexOf('on:'),
      workflow.indexOf('\npermissions:'),
    );

    expect(triggerBlock).toContain("- cron: '23 9 * * *'");
  });

  it('runs only the observational hosted-Checkout project under a separate owner namespace', () => {
    const workflow = readStripeHostedWorkflow();

    expect(workflow).toContain('pnpm test:e2e:stripe-hosted');
    expect(workflow).toContain('E2E_STRIPE_OWNER: github-stripe-hosted-smoke');
    expect(workflow).not.toContain('pnpm test:e2e\n');
  });

  it('uses the same bounded Chromium installer as required CI', () => {
    const stepBlock = findStepBlock(
      readStripeHostedWorkflow(),
      'Install Chromium',
    );

    expect(stepBlock).toContain('timeout-minutes: 12');
    expect(stepBlock).toContain(
      'bash scripts/ci/install-playwright-chromium.sh',
    );
  });

  it('pins dependencies that execute in the secret-bearing hosted workflow', () => {
    const workflow = readStripeHostedWorkflow();

    expect(workflow).toContain(`image: ${PINNED_POSTGRES_16}`);
    expect(workflow).toContain(`uses: ${PINNED_SETUP_NODE}`);
    expect(workflow).toContain(`uses: ${PINNED_UPLOAD_ARTIFACT}`);
    expect(workflow).not.toContain('actions/setup-node@v7');
    expect(workflow).not.toContain('actions/upload-artifact@v7');
  });
});

describe('Stripe provider contract workflow', () => {
  it('advertises the generalized provider-contract lane', () => {
    expect(readStripeProviderWorkflow()).toContain(
      'name: Stripe provider contracts',
    );
  });

  it('serializes runs under the generalized provider-contract identity', () => {
    expect(readStripeProviderWorkflow()).toContain(
      'group: stripe-provider-contracts',
    );
  });

  it('invokes the discoverable fail-closed provider command', () => {
    const stepBlock = findStepBlock(
      readStripeProviderWorkflow(),
      'Run fail-closed Stripe provider contracts',
    );

    expect(stepBlock).toContain('run: pnpm test:stripe-provider');
    expect(stepBlock).not.toContain('scripts/run-trial-clock-smoke.ts');
  });
});
