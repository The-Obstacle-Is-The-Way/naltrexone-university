import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const CI_WORKFLOW_PATH = '.github/workflows/ci.yml';
const CODECOV_CONFIG_PATH = 'codecov.yml';
const STRIPE_HOSTED_WORKFLOW_PATH =
  '.github/workflows/stripe-hosted-checkout-smoke.yml';
const STRIPE_PROVIDER_WORKFLOW_PATH =
  '.github/workflows/stripe-trial-clock-smoke.yml';
const MUTATION_WORKFLOW_PATH = '.github/workflows/mutation.yml';
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
  MUTATION_WORKFLOW_PATH,
] as const;

type WorkflowStep = {
  'continue-on-error'?: boolean;
  'working-directory'?: string;
  env?: Record<string, string>;
  id?: string;
  if?: string;
  name?: string;
  run?: string;
  shell?: string;
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
  return findParsedStepInWorkflow(
    readParsedWorkflow(filePath),
    filePath,
    stepName,
  );
}

function findParsedStepInWorkflow(
  workflow: WorkflowDocument,
  sourceLabel: string,
  stepName: string,
): WorkflowStep {
  const jobs = workflow.jobs ?? {};
  const matches = Object.values(jobs)
    .flatMap((job) => job.steps ?? [])
    .filter((candidate) => candidate.name === stepName);
  const step = matches[0];

  if (!step)
    throw new Error(`Missing workflow step: ${sourceLabel} ${stepName}`);
  if (matches.length > 1)
    throw new Error(`Ambiguous workflow step: ${sourceLabel} ${stepName}`);
  return step;
}

function findParsedJob(filePath: string, jobName: string): WorkflowJob {
  const job = readParsedWorkflow(filePath).jobs?.[jobName];
  if (!job) throw new Error(`Missing workflow job: ${filePath} ${jobName}`);
  return job;
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
  if (/secrets\s*\[/.test(serialized)) {
    throw new Error(
      `Indexed secrets access is unsupported for ${consumer}; use secrets.NAME so scope remains enumerable.`,
    );
  }
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
  it('does not report an echo-only production deployment job as deployment evidence', () => {
    expect(readParsedWorkflow(CI_WORKFLOW_PATH).jobs).not.toHaveProperty(
      'deploy',
    );
  });

  it('runs the blocking test-double fidelity command before unit tests', () => {
    const steps = findParsedJob(CI_WORKFLOW_PATH, 'test').steps ?? [];
    const fidelityIndex = steps.findIndex(
      (step) => step.name === 'Test-double fidelity',
    );
    const unitIndex = steps.findIndex(
      (step) => step.name === 'Unit tests with coverage',
    );

    expect(findParsedStep(CI_WORKFLOW_PATH, 'Test-double fidelity').run).toBe(
      'pnpm lint:doubles',
    );
    expect(fidelityIndex).toBeGreaterThan(-1);
    expect(fidelityIndex).toBeLessThan(unitIndex);
  });

  it('withholds shared E2E credentials from Dependabot PRs while retaining main-push E2E', () => {
    expect(findParsedStep(CI_WORKFLOW_PATH, 'E2E smoke').if).toBe(
      `github.event_name == 'push' || (${HUMAN_SAME_REPO_PR_CONDITION} && ${DEPENDABOT_ACTOR_GUARD})`,
    );
  });

  it('reports the decided shared-credential boundary when Dependabot E2E is skipped', () => {
    const summary = findParsedStep(CI_WORKFLOW_PATH, 'Evidence summary');

    expect(summary.env?.E2E_SKIP_REASON).toBe(
      `\${{ github.actor == 'dependabot[bot]' && 'shared TEST credentials are withheld from Dependabot; main E2E gates production promotion' || (github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name != github.repository && 'fork pull requests do not receive E2E credentials' || 'an earlier required step did not succeed') }}`,
    );
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

describe('Playwright artifact publication', () => {
  const ALL_WORKFLOWS = [
    ...globSync('.github/workflows/*.yml'),
    ...globSync('.github/workflows/*.yaml'),
  ].sort();
  const SCAN_COMMAND = 'pnpm exec tsx scripts/ci/scan-playwright-output.ts';
  const SCAN_GATE = "steps.playwright_output_scan.outcome == 'success'";
  // Uploads that carry no browser output, keyed by workflow, artifact name
  // and path, each with its reason. Any other upload must pass the Playwright
  // output scan.
  const UNSCANNED_UPLOADS: Record<string, string> = {
    '.github/workflows/mutation.yml#mutation-report#reports/mutation':
      'Stryker mutation report; the job runs Vitest, no browser and no Clerk',
  };

  function uploadKey(path: string, upload: WorkflowStep): string {
    return `${path}#${upload.with?.name}#${upload.with?.path}`;
  }

  function jobsOf(workflowPath: string): WorkflowJob[] {
    return Object.values(readParsedWorkflow(workflowPath).jobs ?? {});
  }

  function isUpload(step: WorkflowStep): boolean {
    return /upload/i.test(step.uses ?? '');
  }

  function published(upload: WorkflowStep): string[] {
    return (upload.with?.path ?? '')
      .split('\n')
      .map((entry) => entry.trim())
      .filter((entry) => entry && !entry.startsWith('!'));
  }

  // BUG-328: Clerk's testing-token route handler records each Clerk API call,
  // tokens included, as a setup step, so every HTML report carries them. No
  // step names the report, whatever its means of publishing. The scan skips
  // hidden files because the upload leaves them out.
  it.each(ALL_WORKFLOWS)(
    'never publishes the HTML report or hidden files in %s',
    (path) => {
      for (const step of jobsOf(path).flatMap((job) => job.steps ?? [])) {
        expect(JSON.stringify(step)).not.toContain('playwright-report');
        if (!isUpload(step)) continue;
        expect(String(step.with?.['include-hidden-files'] ?? false)).toBe(
          'false',
        );
      }
    },
  );

  // Any other step that names the failure output could publish it unscanned.
  it.each(ALL_WORKFLOWS)(
    'names test-results only in the scan and scanned uploads in %s',
    (path) => {
      for (const step of jobsOf(path).flatMap((job) => job.steps ?? [])) {
        if (!JSON.stringify(step).includes('test-results')) continue;
        expect(
          step.id === 'playwright_output_scan' ||
            (isUpload(step) && step.if?.includes(SCAN_GATE)),
        ).toBe(true);
      }
    },
  );

  it.each(ALL_WORKFLOWS)(
    'uploads only what the scan passed, unless exempt, in %s',
    (path) => {
      for (const job of jobsOf(path)) {
        const steps = job.steps ?? [];
        steps.forEach((upload, index) => {
          if (!isUpload(upload)) return;
          if (UNSCANNED_UPLOADS[uploadKey(path, upload)]) return;

          const scanIndex = steps.findIndex(
            (step) => step.id === 'playwright_output_scan',
          );
          const scan = steps[scanIndex];
          expect(scanIndex).toBeGreaterThanOrEqual(0);
          expect(scanIndex).toBeLessThan(index);
          // Nothing may change the output between the scan and the upload.
          expect(steps.slice(scanIndex + 1, index).every(isUpload)).toBe(true);
          expect(scan?.run).toMatch(
            /^pnpm exec tsx scripts\/ci\/scan-playwright-output\.ts( [\w./-]+)+$/,
          );
          expect(scan?.['continue-on-error']).toBeUndefined();
          expect(scan?.shell).toBeUndefined();
          expect(scan?.['working-directory']).toBeUndefined();
          expect(upload.if).not.toContain('||');
          expect(upload.if).toMatch(
            new RegExp(`&& ${SCAN_GATE.replace(/[.()]/g, '\\$&')} }}$`),
          );
          const scanned = (scan?.run ?? '')
            .replace(SCAN_COMMAND, '')
            .split(' ');
          for (const entry of published(upload)) {
            expect(scanned).toContain(entry.replace(/\/$/, ''));
          }
        });
      }
    },
  );

  it('keeps every exemption pointing at a real upload', () => {
    const uploads = ALL_WORKFLOWS.flatMap((path) =>
      jobsOf(path).flatMap((job) =>
        (job.steps ?? [])
          .filter(isUpload)
          .map((upload) => uploadKey(path, upload)),
      ),
    );

    for (const exemption of Object.keys(UNSCANNED_UPLOADS)) {
      expect(uploads).toContain(exemption);
    }
  });

  it.each([
    [CI_WORKFLOW_PATH, 'E2E smoke', 'e2e_smoke'],
    [
      STRIPE_HOSTED_WORKFLOW_PATH,
      'Run observational Stripe-hosted Checkout journeys',
      'hosted_e2e',
    ],
  ])(
    'scans and uploads failure output only when E2E failed in %s',
    (workflowPath, e2eStepName, e2eStepId) => {
      const e2e = findParsedStep(workflowPath, e2eStepName);
      const scan = findParsedStep(workflowPath, 'Scan Playwright output');
      const failureOutput = findParsedStep(
        workflowPath,
        'Upload Playwright failure output',
      );
      const failed = `!cancelled() && steps.${e2eStepId}.outcome == 'failure'`;

      expect(e2e.id).toBe(e2eStepId);
      expect(scan.if).toBe(`\${{ ${failed} }}`);
      expect(scan.run).toBe(`${SCAN_COMMAND} test-results`);
      expect(failureOutput.if).toBe(
        `\${{ ${failed} && steps.playwright_output_scan.outcome == 'success' }}`,
      );
      expect(failureOutput.with?.path).toBe(
        'test-results/\n!**/.auth/**\n!**/trace.zip\n',
      );
    },
  );
});

describe('workflow secret scope', () => {
  it('fails closed when a step name is ambiguous across jobs', () => {
    const workflow = parse(`
jobs:
  first:
    steps:
      - name: Build
        run: pnpm build
  second:
    steps:
      - name: Build
        run: pnpm build
`) as WorkflowDocument;

    expect(() =>
      findParsedStepInWorkflow(workflow, 'synthetic workflow', 'Build'),
    ).toThrow('Ambiguous workflow step: synthetic workflow Build');
  });

  it('scopes Clerk activation to Build and E2E instead of the whole job', () => {
    const requiredBuild = findParsedStep(CI_WORKFLOW_PATH, 'Build');
    const requiredE2e = findParsedStep(CI_WORKFLOW_PATH, 'E2E smoke');
    const hostedBuild = findParsedStep(STRIPE_HOSTED_WORKFLOW_PATH, 'Build');
    const hostedE2e = findParsedStep(
      STRIPE_HOSTED_WORKFLOW_PATH,
      'Run observational Stripe-hosted Checkout journeys',
    );

    expect(findParsedJob(CI_WORKFLOW_PATH, 'test').env).not.toHaveProperty(
      'NEXT_PUBLIC_SKIP_CLERK',
    );
    expect(
      findParsedJob(STRIPE_HOSTED_WORKFLOW_PATH, 'hosted-checkout').env,
    ).not.toHaveProperty('NEXT_PUBLIC_SKIP_CLERK');
    expect(requiredBuild.env?.NEXT_PUBLIC_SKIP_CLERK).toBe(
      `\${{ secrets.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY == '' && 'true' || 'false' }}`,
    );
    expect(requiredE2e.env?.NEXT_PUBLIC_SKIP_CLERK).toBe('false');
    expect(hostedBuild.env?.NEXT_PUBLIC_SKIP_CLERK).toBe('false');
    expect(hostedE2e.env?.NEXT_PUBLIC_SKIP_CLERK).toBe('false');
  });

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

  it('fails closed on indexed secret expressions', () => {
    const workflow = parse(`
jobs:
  test:
    steps:
      - name: Indexed secret
        env:
          TOKEN: \${{ secrets['TOKEN'] }}
`) as WorkflowDocument;

    expect(() => secretConsumersInWorkflow(workflow)).toThrow(
      'Indexed secrets access is unsupported',
    );
  });

  it('gives each secret only to its documented consumer step', () => {
    expect(secretConsumers(CI_WORKFLOW_PATH)).toEqual(
      [
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

  // DEBT-497: an upload that fails is reported in the job, not hidden behind
  // a green step, and still does not fail CI. The merge guard decides.
  it('reports a failed Codecov upload in the job without failing it', () => {
    const upload = findParsedStep(
      CI_WORKFLOW_PATH,
      'Upload coverage to Codecov',
    );
    const report = findParsedStep(
      CI_WORKFLOW_PATH,
      'Report a failed Codecov upload',
    );

    expect(upload).toMatchObject({
      id: 'codecov',
      'continue-on-error': true,
      with: { fail_ci_if_error: true },
    });
    expect(report.if).toContain("steps.codecov.outcome == 'failure'");
    expect(report.run).toContain('::warning');
    expect(report.run).toContain('GITHUB_STEP_SUMMARY');
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

  // BUG-327: a mutable tag can change what runs between two runs of the same
  // commit, so every service or job container is pinned by digest, in every
  // workflow.
  it('pins every container image by digest, in every workflow', () => {
    const images = [
      ...globSync('.github/workflows/*.yml'),
      ...globSync('.github/workflows/*.yaml'),
    ].flatMap((file) => {
      const jobs = Object.values(
        (
          parse(readFileSync(file, 'utf8')) as {
            jobs?: Record<
              string,
              {
                container?: { image?: string } | string;
                services?: Record<string, { image?: string }>;
              }
            >;
          }
        ).jobs ?? {},
      );
      return jobs
        .flatMap((job) => [
          ...Object.values(job.services ?? {}).map((service) => service.image),
          typeof job.container === 'string'
            ? job.container
            : job.container?.image,
        ])
        .filter((image): image is string => typeof image === 'string')
        .map((image) => ({ file, image }));
    });

    expect(images.length).toBeGreaterThanOrEqual(2);
    expect(
      images.filter(
        ({ image }) => !/^[^@\s]+@sha256:[0-9a-f]{64}$/.test(image),
      ),
    ).toEqual([]);
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

// DEBT-465 Part 2: mutation testing reports weekly and never gates (ADR-019).
// #1160 review: a job-level `permissions` block overrides the workflow's, so
// read-only means exactly `contents: read` at the top and no job-level block.
// Parsed as YAML (#1161 review): `permissions :` is the same key as
// `permissions:`, so a text match cannot decide this.
function readsRepositoryOnly(source: string): boolean {
  const workflow = parse(source) as {
    permissions?: unknown;
    jobs?: Record<string, { permissions?: unknown }>;
  };
  const jobs = Object.values(workflow.jobs ?? {});
  return (
    JSON.stringify(workflow.permissions) ===
      JSON.stringify({ contents: 'read' }) &&
    jobs.length > 0 &&
    jobs.every((job) => job.permissions === undefined)
  );
}

describe('Mutation workflow', () => {
  const workflow = () => readFileSync(MUTATION_WORKFLOW_PATH, 'utf8');

  it('runs weekly or on dispatch, never for pull requests or pushes', () => {
    const source = workflow();
    const triggerBlock = source.slice(
      source.indexOf('on:'),
      source.indexOf('\npermissions:'),
    );

    expect(triggerBlock).toContain("- cron: '0 6 * * 1'");
    expect(triggerBlock).toContain('workflow_dispatch:');
    expect(triggerBlock).not.toContain('pull_request:');
    expect(triggerBlock).not.toContain('push:');
  });

  it('reads the repository only and uses no secrets', () => {
    const source = workflow();

    expect(readsRepositoryOnly(source)).toBe(true);
    expect(source).not.toContain('secrets.');
  });

  it.each([
    ['a job-level override', '    permissions:\n      contents: write\n'],
    [
      'a job-level override spelled with a space before the colon',
      '    permissions :\n      contents: write\n',
    ],
    ['a job-level write-all', '    permissions: write-all\n'],
  ])('treats %s as not read-only', (_name, jobPermissions) => {
    const widened = workflow().replace(
      '    runs-on: ubuntu-24.04\n',
      `    runs-on: ubuntu-24.04\n${jobPermissions}`,
    );

    expect(widened).not.toBe(workflow());
    expect(readsRepositoryOnly(widened)).toBe(false);
  });

  it('treats wider workflow-level permissions as not read-only', () => {
    const widened = workflow().replace(
      'permissions:\n  contents: read\n',
      'permissions:\n  contents: read\n  pull-requests: write\n',
    );

    expect(widened).not.toBe(workflow());
    expect(readsRepositoryOnly(widened)).toBe(false);
  });

  // #1160 review: incremental results survive a change to an unmutated import,
  // so the weekly report is a full run with no restored incremental file.
  it('runs a full Stryker measurement and uploads its report without a breaking threshold', () => {
    const source = workflow();

    expect(source).toContain('run: pnpm exec stryker run --force');
    expect(source).not.toContain('actions/cache');
    expect(source).not.toContain('.stryker-incremental.json');
    expect(source).toContain(`uses: ${PINNED_UPLOAD_ARTIFACT} # v`);
    expect(
      JSON.parse(readFileSync('stryker.config.json', 'utf8')).thresholds.break,
    ).toBeNull();
  });
});
