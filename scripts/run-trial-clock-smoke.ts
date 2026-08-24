import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { STRIPE_CHECKOUT_CLIENT_CONTRACT_CASE_TITLES } from '@/tests/shared/stripe-checkout-client-contract-cases';

export const TRIAL_CLOCK_SMOKE_FILE =
  'tests/integration/stripe-trial-clock-smoke.integration.test.ts';
export const STRIPE_CHECKOUT_CLIENT_CONTRACT_FILE =
  'tests/integration/stripe-checkout-client-contract.integration.test.ts';

export const TRIAL_CLOCK_SMOKE_CASE_TITLES = [
  'cancels a trialing subscription at trial end when no card is present',
  'activates a trialing subscription at trial end when a card is present',
] as const;

const STRIPE_PROVIDER_CONTRACT_FILES = [
  TRIAL_CLOCK_SMOKE_FILE,
  STRIPE_CHECKOUT_CLIENT_CONTRACT_FILE,
] as const;

const STRIPE_PROVIDER_CONTRACT_CASE_TITLES = [
  ...TRIAL_CLOCK_SMOKE_CASE_TITLES,
  ...STRIPE_CHECKOUT_CLIENT_CONTRACT_CASE_TITLES,
] as const;

// The live trial-clock proof has healthy cases just over the ordinary
// integration lane's 10-second budget. Keep this scheduled-only allowance
// below the five-minute process-tree bound and out of the hermetic lane.
const STRIPE_PROVIDER_CONTRACT_TEST_TIMEOUT_MS = 20_000;

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
  const contractPriceId =
    env.STRIPE_TRIAL_CLOCK_PRICE_ID ?? env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY;
  return {
    command: 'pnpm',
    args: [
      'exec',
      'vitest',
      'run',
      '--config',
      'vitest.integration.config.mts',
      ...STRIPE_PROVIDER_CONTRACT_FILES,
      `--testTimeout=${STRIPE_PROVIDER_CONTRACT_TEST_TIMEOUT_MS}`,
      '--reporter=json',
      `--outputFile=${outputFile}`,
    ],
    env: {
      ...env,
      // The smoke imports no database code. An explicit empty value prevents
      // .env.test from making the shared integration setup probe Postgres.
      DATABASE_URL: '',
      RUN_STRIPE_CHECKOUT_CLIENT_CONTRACT: 'true',
      RUN_STRIPE_TRIAL_CLOCK_SMOKE: 'true',
      STRIPE_CHECKOUT_CONTRACT_PRICE_ID: contractPriceId,
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

  const assertions: ReporterAssertion[] = [];
  for (const expectedFile of STRIPE_PROVIDER_CONTRACT_FILES) {
    const normalizedSuffix = `/${expectedFile}`;
    const matchingResults = report.testResults.filter((result) => {
      if (!isRecord(result) || typeof result.name !== 'string') return false;
      const normalizedName = result.name.replaceAll('\\', '/');
      return (
        normalizedName === expectedFile ||
        normalizedName.endsWith(normalizedSuffix)
      );
    });

    if (matchingResults.length !== 1) {
      throw new Error(
        `PROOF_FILE_COUNT_INVALID: expected one report for ${expectedFile}, received ${matchingResults.length}`,
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

    for (const assertion of matchingResult.assertionResults) {
      if (
        !isRecord(assertion) ||
        typeof assertion.title !== 'string' ||
        typeof assertion.status !== 'string'
      ) {
        throw new Error(
          'PROOF_REPORT_INVALID: smoke report contains a malformed assertion',
        );
      }
      assertions.push({ title: assertion.title, status: assertion.status });
    }
  }

  return assertions;
}

export function assertSmokeExecuted(report: unknown): TrialClockSmokeResult {
  const assertions = readReporterAssertions(report);
  const skipped = assertions.filter((assertion) =>
    ['skipped', 'pending', 'todo', 'disabled'].includes(assertion.status),
  );
  if (skipped.length > 0) {
    throw new Error(
      `PROOF_SKIPPED: scheduled smoke reported ${skipped.length} skipped cases`,
    );
  }

  for (const expectedTitle of STRIPE_PROVIDER_CONTRACT_CASE_TITLES) {
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

// The two trial-clock cases and four Checkout client contract cases normally
// finish in under two minutes. Five minutes bounds a stuck provider process
// tree while leaving equal headroom inside the workflow's 10-minute job budget.
const TRIAL_CLOCK_SMOKE_PROCESS_TIMEOUT_MS = 5 * 60 * 1000;
const TRIAL_CLOCK_SMOKE_SIGNAL_GRACE_MS = 10 * 1000;

type KillableChildProcess = Pick<ChildProcess, 'kill' | 'pid'>;
type KillProcessGroup = (pid: number, signal: NodeJS.Signals) => unknown;
type ParentSignalSource = {
  once(event: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
  off(event: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
};

export function terminateVitestProcessTree(
  child: KillableChildProcess,
  platform: NodeJS.Platform = process.platform,
  killProcessGroup: KillProcessGroup = (pid, signal) =>
    process.kill(pid, signal),
  signal: NodeJS.Signals = 'SIGKILL',
): void {
  if (platform === 'win32' || child.pid === undefined) {
    child.kill(signal);
    return;
  }

  try {
    killProcessGroup(-child.pid, signal);
  } catch {
    // The group may already have exited between the timeout and the signal.
    child.kill(signal);
  }
}

export async function spawnVitest(
  invocation: TrialClockSmokeInvocation,
  timeoutMs: number = TRIAL_CLOCK_SMOKE_PROCESS_TIMEOUT_MS,
  parentSignals: ParentSignalSource = process,
  signalGraceMs: number = TRIAL_CLOCK_SMOKE_SIGNAL_GRACE_MS,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child: ChildProcess = spawn(invocation.command, invocation.args, {
      detached: process.platform !== 'win32',
      env: { ...invocation.env } as NodeJS.ProcessEnv,
      stdio: 'inherit',
    });

    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    let signalGraceTimer: ReturnType<typeof setTimeout> | undefined;
    // A forwarded signal must not leave the runner waiting forever on a child
    // that ignores it: escalate the whole tree to SIGKILL after the grace.
    const escalateAfterGrace = () => {
      if (signalGraceTimer !== undefined) clearTimeout(signalGraceTimer);
      signalGraceTimer = setTimeout(() => {
        terminateVitestProcessTree(
          child,
          process.platform,
          undefined,
          'SIGKILL',
        );
      }, signalGraceMs);
      signalGraceTimer.unref();
    };
    const forwardSigint = () => {
      terminateVitestProcessTree(child, process.platform, undefined, 'SIGINT');
      escalateAfterGrace();
    };
    const forwardSigterm = () => {
      terminateVitestProcessTree(child, process.platform, undefined, 'SIGTERM');
      escalateAfterGrace();
    };
    const removeParentSignalHandlers = () => {
      parentSignals.off('SIGINT', forwardSigint);
      parentSignals.off('SIGTERM', forwardSigterm);
    };

    const settle = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signalGraceTimer !== undefined) clearTimeout(signalGraceTimer);
      removeParentSignalHandlers();
      action();
    };

    parentSignals.once('SIGINT', forwardSigint);
    parentSignals.once('SIGTERM', forwardSigterm);
    timer = setTimeout(() => {
      settle(() => {
        terminateVitestProcessTree(child);
        reject(
          new Error(
            `TRIAL_CLOCK_SMOKE_PROCESS_TIMEOUT: Vitest exceeded ${timeoutMs}ms`,
          ),
        );
      });
    }, timeoutMs);
    timer.unref();

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
    try {
      await runInvocation(invocation);
    } catch (processError) {
      // The JSON reporter swallows per-case output, and the scratch report is
      // deleted below — so a hosted failure would otherwise never say WHICH
      // case failed. Surface a redacted per-case summary before cleanup.
      await printRedactedCaseSummary(outputFile);
      throw processError;
    }
    return await readJsonReport(outputFile);
  } finally {
    await rm(scratchDirectory, { recursive: true, force: true });
  }
}

const SENSITIVE_TOKEN_PATTERN =
  /(?:(?:cus|sub|clock|acct|req|seti|si|pm|in|price|cs)_[A-Za-z0-9]+|sk_(?:test|live)_[A-Za-z0-9]+|https?:\/\/\S+|\/(?:Users|home)\/\S+)/g;

export function redactDiagnosticText(text: string): string {
  return text.replaceAll(SENSITIVE_TOKEN_PATTERN, '[redacted]');
}

async function printRedactedCaseSummary(outputFile: string): Promise<void> {
  let report: unknown;
  try {
    report = JSON.parse(await readFile(outputFile, 'utf8')) as unknown;
  } catch {
    // Intentional diagnostic fallback: this summary is best-effort context for
    // an already-failing run, so read/parse errors must not mask the primary
    // process failure that the caller is about to rethrow.
    console.error(
      '[trial-clock-smoke] no readable JSON report to summarize the failure',
    );
    return;
  }
  if (!isRecord(report) || !Array.isArray(report.testResults)) return;
  for (const result of report.testResults) {
    if (!isRecord(result) || !Array.isArray(result.assertionResults)) continue;
    for (const assertion of result.assertionResults) {
      if (!isRecord(assertion)) continue;
      const title =
        typeof assertion.title === 'string' ? assertion.title : 'unknown case';
      const status =
        typeof assertion.status === 'string' ? assertion.status : 'unknown';
      const firstFailureLine =
        Array.isArray(assertion.failureMessages) &&
        typeof assertion.failureMessages[0] === 'string'
          ? redactDiagnosticText(
              assertion.failureMessages[0].split('\n')[0] ?? '',
            ).slice(0, 200)
          : '';
      console.error(
        `[trial-clock-smoke] case "${title}" status=${status}${firstFailureLine ? ` detail=${firstFailureLine}` : ''}`,
      );
    }
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
