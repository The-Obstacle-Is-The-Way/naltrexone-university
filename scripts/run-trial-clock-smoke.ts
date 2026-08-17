import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const TRIAL_CLOCK_SMOKE_FILE =
  'tests/integration/stripe-trial-clock-smoke.integration.test.ts';

export const TRIAL_CLOCK_SMOKE_CASE_TITLES = [
  'cancels a trialing subscription at trial end when no card is present',
  'activates a trialing subscription at trial end when a card is present',
] as const;

type SmokeEnvironment = Readonly<Record<string, string | undefined>>;

export type TrialClockSmokeInvocation = {
  command: string;
  args: string[];
  env: SmokeEnvironment;
};

type TrialClockSmokeResult = {
  executed: number;
  passed: number;
  skipped: number;
};

type RunVitest = (env: SmokeEnvironment) => Promise<unknown>;

type RunTrialClockSmokeInput = {
  env?: SmokeEnvironment;
  runVitest?: RunVitest;
};

type ReporterAssertion = {
  title: string;
  status: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isUsableStripeTestKey(value: string | undefined): boolean {
  return Boolean(value?.startsWith('sk_test_') && !value.includes('dummy'));
}

function isUsableStripePriceId(value: string | undefined): boolean {
  return Boolean(value?.startsWith('price_') && !value.includes('dummy'));
}

function assertPreflight(env: SmokeEnvironment): void {
  if (env.RUN_STRIPE_TRIAL_CLOCK_SMOKE !== 'true') {
    throw new Error(
      'PREFLIGHT_FLAG_INVALID: RUN_STRIPE_TRIAL_CLOCK_SMOKE must equal true',
    );
  }

  if (!isUsableStripeTestKey(env.STRIPE_SECRET_KEY)) {
    throw new Error(
      'PREFLIGHT_KEY_INVALID: STRIPE_SECRET_KEY must be a real Stripe test key (sk_test_ and not a dummy placeholder)',
    );
  }

  const stripePriceId =
    env.STRIPE_TRIAL_CLOCK_PRICE_ID ?? env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY;
  if (!isUsableStripePriceId(stripePriceId)) {
    throw new Error(
      'PREFLIGHT_PRICE_INVALID: provide a real Stripe test price through STRIPE_TRIAL_CLOCK_PRICE_ID or NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY',
    );
  }
}

export function createTrialClockSmokeInvocation(
  outputFile: string,
  env: SmokeEnvironment,
): TrialClockSmokeInvocation {
  return {
    command: 'pnpm',
    args: [
      'exec',
      'vitest',
      'run',
      '--config',
      'vitest.integration.config.mts',
      TRIAL_CLOCK_SMOKE_FILE,
      '--reporter=json',
      `--outputFile=${outputFile}`,
    ],
    env: {
      ...env,
      // The smoke imports no database code. An explicit empty value prevents
      // .env.test from making the shared integration setup probe Postgres.
      DATABASE_URL: '',
      RUN_STRIPE_TRIAL_CLOCK_SMOKE: 'true',
    },
  };
}

function readReporterAssertions(report: unknown): ReporterAssertion[] {
  if (!isRecord(report) || report.success !== true) {
    throw new Error(
      'PROOF_REPORT_INVALID: Vitest did not produce a successful JSON report',
    );
  }

  if (!Array.isArray(report.testResults)) {
    throw new Error(
      'PROOF_REPORT_INVALID: Vitest JSON report has no testResults array',
    );
  }

  const normalizedSmokeSuffix = `/${TRIAL_CLOCK_SMOKE_FILE}`;
  const matchingResults = report.testResults.filter((result) => {
    if (!isRecord(result) || typeof result.name !== 'string') return false;
    const normalizedName = result.name.replaceAll('\\', '/');
    return (
      normalizedName === TRIAL_CLOCK_SMOKE_FILE ||
      normalizedName.endsWith(normalizedSmokeSuffix)
    );
  });

  if (matchingResults.length !== 1) {
    throw new Error(
      `PROOF_FILE_COUNT_INVALID: expected one report for ${TRIAL_CLOCK_SMOKE_FILE}, received ${matchingResults.length}`,
    );
  }

  const matchingResult = matchingResults[0];
  if (
    !isRecord(matchingResult) ||
    !Array.isArray(matchingResult.assertionResults)
  ) {
    throw new Error(
      'PROOF_REPORT_INVALID: smoke report has no assertionResults array',
    );
  }

  return matchingResult.assertionResults.map((assertion) => {
    if (
      !isRecord(assertion) ||
      typeof assertion.title !== 'string' ||
      typeof assertion.status !== 'string'
    ) {
      throw new Error(
        'PROOF_REPORT_INVALID: smoke report contains a malformed assertion',
      );
    }
    return { title: assertion.title, status: assertion.status };
  });
}

function assertSmokeExecuted(report: unknown): TrialClockSmokeResult {
  const assertions = readReporterAssertions(report);
  const skipped = assertions.filter((assertion) =>
    ['skipped', 'pending', 'todo', 'disabled'].includes(assertion.status),
  );
  if (skipped.length > 0) {
    throw new Error(
      `PROOF_SKIPPED: scheduled smoke reported ${skipped.length} skipped cases`,
    );
  }

  for (const expectedTitle of TRIAL_CLOCK_SMOKE_CASE_TITLES) {
    const matches = assertions.filter(
      (assertion) => assertion.title === expectedTitle,
    );
    if (matches.length === 0) {
      throw new Error(`PROOF_MISSING_CASE: ${expectedTitle}`);
    }
    if (matches.length !== 1) {
      throw new Error(`PROOF_DUPLICATE_CASE: ${expectedTitle}`);
    }
    if (matches[0]?.status !== 'passed') {
      throw new Error(`PROOF_CASE_NOT_PASSED: ${expectedTitle}`);
    }
  }

  const nonPassing = assertions.filter(
    (assertion) => assertion.status !== 'passed',
  );
  if (nonPassing.length > 0) {
    throw new Error(
      `PROOF_NONPASSING_CASE: smoke report contains ${nonPassing.length} non-passing cases`,
    );
  }

  return {
    executed: assertions.length,
    passed: assertions.length,
    skipped: 0,
  };
}

// Two 10-second cases plus two 15-second cleanup-hook budgets normally finish
// in under a minute. Five minutes bounds a stuck provider child while leaving
// equal headroom inside the workflow's 10-minute job budget.
const TRIAL_CLOCK_SMOKE_PROCESS_TIMEOUT_MS = 5 * 60 * 1000;

export async function spawnVitest(
  invocation: TrialClockSmokeInvocation,
  timeoutMs: number = TRIAL_CLOCK_SMOKE_PROCESS_TIMEOUT_MS,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child: ChildProcess = spawn(invocation.command, invocation.args, {
      env: { ...invocation.env } as NodeJS.ProcessEnv,
      stdio: 'inherit',
    });

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(
        new Error(
          `TRIAL_CLOCK_SMOKE_PROCESS_TIMEOUT: Vitest exceeded ${timeoutMs}ms`,
        ),
      );
    }, timeoutMs);
    timer.unref();

    const settle = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      action();
    };

    child.once('error', (error) => {
      settle(() => {
        reject(
          new Error(
            'TRIAL_CLOCK_SMOKE_PROCESS_START_FAILED: unable to start Vitest',
            { cause: error },
          ),
        );
      });
    });
    child.once('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      settle(() => {
        if (code === 0) {
          resolve();
          return;
        }

        const reason =
          signal === null
            ? `exit code ${code ?? 'unknown'}`
            : `signal ${signal}`;
        reject(
          new Error(
            `TRIAL_CLOCK_SMOKE_PROCESS_FAILED: Vitest ended with ${reason}`,
          ),
        );
      });
    });
  });
}

async function readJsonReport(outputFile: string): Promise<unknown> {
  let rawReport: string;
  try {
    rawReport = await readFile(outputFile, 'utf8');
  } catch (error) {
    throw new Error(
      'PROOF_REPORT_MISSING: Vitest produced no readable JSON report file',
      { cause: error },
    );
  }

  try {
    return JSON.parse(rawReport) as unknown;
  } catch {
    throw new Error(
      'PROOF_REPORT_INVALID: Vitest output file is not valid JSON',
    );
  }
}

export async function runVitestWithJsonReporter(
  env: SmokeEnvironment,
  runInvocation: (
    invocation: TrialClockSmokeInvocation,
  ) => Promise<void> = spawnVitest,
): Promise<unknown> {
  const scratchDirectory = await mkdtemp(
    path.join(tmpdir(), 'debt468-trial-clock-smoke-'),
  );
  const outputFile = path.join(scratchDirectory, 'vitest-report.json');

  try {
    const invocation = createTrialClockSmokeInvocation(outputFile, env);
    await runInvocation(invocation);
    return await readJsonReport(outputFile);
  } finally {
    await rm(scratchDirectory, { recursive: true, force: true });
  }
}

export async function runTrialClockSmoke({
  env = process.env,
  runVitest = runVitestWithJsonReporter,
}: RunTrialClockSmokeInput = {}): Promise<TrialClockSmokeResult> {
  assertPreflight(env);
  const report = await runVitest(env);
  return assertSmokeExecuted(report);
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';

/* v8 ignore start -- direct CLI entrypoint; behavior is covered through runTrialClockSmoke */
if (import.meta.url === executedPath) {
  runTrialClockSmoke()
    .then((result) => {
      console.log(
        `[trial-clock-smoke] PASS executed=${result.executed} passed=${result.passed} skipped=${result.skipped}`,
      );
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[trial-clock-smoke] FAIL ${message}`);
      process.exitCode = 1;
    });
}
/* v8 ignore stop */
