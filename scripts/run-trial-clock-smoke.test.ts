import { access, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createTrialClockSmokeInvocation,
  runTrialClockSmoke,
  runVitestWithJsonReporter,
  spawnVitest,
  TRIAL_CLOCK_SMOKE_CASE_TITLES,
  TRIAL_CLOCK_SMOKE_FILE,
} from './run-trial-clock-smoke';

type SmokeEnvironment = Readonly<Record<string, string | undefined>>;

function validEnvironment(overrides: SmokeEnvironment = {}): SmokeEnvironment {
  return {
    RUN_STRIPE_TRIAL_CLOCK_SMOKE: 'true',
    STRIPE_SECRET_KEY: 'sk_test_contract_only',
    NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: 'price_contract_only',
    ...overrides,
  };
}

function reporterOutput(
  assertions: Array<{ title: string; status: string }>,
): unknown {
  return {
    success: true,
    testResults: [
      {
        name: `/repo/${TRIAL_CLOCK_SMOKE_FILE}`,
        status: 'passed',
        assertionResults: assertions,
      },
    ],
  };
}

describe('runTrialClockSmoke preflight', () => {
  it('fails closed when the opt-in flag is absent', async () => {
    const runVitest = vi.fn(async () => reporterOutput([]));

    await expect(
      runTrialClockSmoke({
        env: validEnvironment({ RUN_STRIPE_TRIAL_CLOCK_SMOKE: undefined }),
        runVitest,
      }),
    ).rejects.toThrow(
      'PREFLIGHT_FLAG_INVALID: RUN_STRIPE_TRIAL_CLOCK_SMOKE must equal true',
    );
    expect(runVitest).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', undefined],
    ['live-mode', 'sk_live_contract_only'],
    ['dummy', 'sk_test_dummy'],
  ])('fails closed when the Stripe key is %s', async (_label, value) => {
    const runVitest = vi.fn(async () => reporterOutput([]));

    await expect(
      runTrialClockSmoke({
        env: validEnvironment({ STRIPE_SECRET_KEY: value }),
        runVitest,
      }),
    ).rejects.toThrow(
      'PREFLIGHT_KEY_INVALID: STRIPE_SECRET_KEY must be a real Stripe test key',
    );
    expect(runVitest).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', undefined],
    ['wrong shape', 'prod_contract_only'],
    ['dummy', 'price_dummy_monthly'],
  ])('fails closed when the Stripe price is %s', async (_label, value) => {
    const runVitest = vi.fn(async () => reporterOutput([]));

    await expect(
      runTrialClockSmoke({
        env: validEnvironment({
          STRIPE_TRIAL_CLOCK_PRICE_ID: undefined,
          NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: value,
        }),
        runVitest,
      }),
    ).rejects.toThrow(
      'PREFLIGHT_PRICE_INVALID: provide a real Stripe test price through STRIPE_TRIAL_CLOCK_PRICE_ID or NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY',
    );
    expect(runVitest).not.toHaveBeenCalled();
  });

  it('matches the smoke suite by rejecting an invalid override before a valid monthly fallback', async () => {
    const runVitest = vi.fn(async () => reporterOutput([]));

    await expect(
      runTrialClockSmoke({
        env: validEnvironment({
          STRIPE_TRIAL_CLOCK_PRICE_ID: 'price_dummy_override',
        }),
        runVitest,
      }),
    ).rejects.toThrow('PREFLIGHT_PRICE_INVALID');
    expect(runVitest).not.toHaveBeenCalled();
  });

  it('never includes credential values in a preflight failure', async () => {
    const invalidKey = 'sk_live_do_not_print_this_value';
    let failure: unknown;

    try {
      await runTrialClockSmoke({
        env: validEnvironment({ STRIPE_SECRET_KEY: invalidKey }),
        runVitest: async () => reporterOutput([]),
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain('PREFLIGHT_KEY_INVALID');
    expect((failure as Error).message).not.toContain(invalidKey);
  });
});

describe('createTrialClockSmokeInvocation', () => {
  it('targets only the smoke through the integration config and disables the unused database setup', () => {
    const invocation = createTrialClockSmokeInvocation(
      '/tmp/trial-clock-smoke.json',
      validEnvironment({ DATABASE_URL: 'postgresql://remote.example/app' }),
    );

    expect(invocation).toEqual({
      command: 'pnpm',
      args: [
        'exec',
        'vitest',
        'run',
        '--config',
        'vitest.integration.config.mts',
        TRIAL_CLOCK_SMOKE_FILE,
        '--reporter=json',
        '--outputFile=/tmp/trial-clock-smoke.json',
      ],
      env: {
        ...validEnvironment({
          DATABASE_URL: 'postgresql://remote.example/app',
        }),
        DATABASE_URL: '',
        RUN_STRIPE_TRIAL_CLOCK_SMOKE: 'true',
      },
    });
  });
});

describe('runTrialClockSmoke execution proof', () => {
  it('fails when Vitest reports the smoke cases as skipped', async () => {
    const runVitest = vi.fn(async () =>
      reporterOutput(
        TRIAL_CLOCK_SMOKE_CASE_TITLES.map((title) => ({
          title,
          status: 'skipped',
        })),
      ),
    );

    await expect(
      runTrialClockSmoke({ env: validEnvironment(), runVitest }),
    ).rejects.toThrow(
      'PROOF_SKIPPED: scheduled smoke reported 2 skipped cases',
    );
  });

  it('fails when only one named case executed', async () => {
    const runVitest = vi.fn(async () =>
      reporterOutput([
        { title: TRIAL_CLOCK_SMOKE_CASE_TITLES[0], status: 'passed' },
      ]),
    );

    await expect(
      runTrialClockSmoke({ env: validEnvironment(), runVitest }),
    ).rejects.toThrow(
      `PROOF_MISSING_CASE: ${TRIAL_CLOCK_SMOKE_CASE_TITLES[1]}`,
    );
  });

  it('passes only when both named cases executed and passed with zero skips', async () => {
    const report = reporterOutput(
      TRIAL_CLOCK_SMOKE_CASE_TITLES.map((title) => ({
        title,
        status: 'passed',
      })),
    );
    const runVitest = vi.fn(async () => report);

    await expect(
      runTrialClockSmoke({ env: validEnvironment(), runVitest }),
    ).resolves.toEqual({ executed: 2, passed: 2, skipped: 0 });
    expect(runVitest).toHaveBeenCalledOnce();
  });

  it.each([
    [
      'an unsuccessful report',
      { success: false, testResults: [] },
      'PROOF_REPORT_INVALID: Vitest did not produce a successful JSON report',
    ],
    [
      'a missing testResults array',
      { success: true },
      'PROOF_REPORT_INVALID: Vitest JSON report has no testResults array',
    ],
    [
      'a missing smoke file',
      {
        success: true,
        testResults: [
          {
            name: '/repo/tests/integration/other.test.ts',
            assertionResults: [],
          },
        ],
      },
      `PROOF_FILE_COUNT_INVALID: expected one report for ${TRIAL_CLOCK_SMOKE_FILE}, received 0`,
    ],
    [
      'duplicate smoke-file results',
      {
        success: true,
        testResults: [
          { name: `/repo/${TRIAL_CLOCK_SMOKE_FILE}`, assertionResults: [] },
          { name: TRIAL_CLOCK_SMOKE_FILE, assertionResults: [] },
        ],
      },
      `PROOF_FILE_COUNT_INVALID: expected one report for ${TRIAL_CLOCK_SMOKE_FILE}, received 2`,
    ],
    [
      'a missing assertionResults array',
      {
        success: true,
        testResults: [{ name: `/repo/${TRIAL_CLOCK_SMOKE_FILE}` }],
      },
      'PROOF_REPORT_INVALID: smoke report has no assertionResults array',
    ],
    [
      'a malformed assertion',
      {
        success: true,
        testResults: [
          {
            name: `/repo/${TRIAL_CLOCK_SMOKE_FILE}`,
            assertionResults: [{ status: 'passed' }],
          },
        ],
      },
      'PROOF_REPORT_INVALID: smoke report contains a malformed assertion',
    ],
  ])('fails closed for %s', async (_label, report, expectedMessage) => {
    await expect(
      runTrialClockSmoke({
        env: validEnvironment(),
        runVitest: async () => report,
      }),
    ).rejects.toThrow(expectedMessage);
  });

  it('rejects duplicate named cases', async () => {
    const [firstTitle, secondTitle] = TRIAL_CLOCK_SMOKE_CASE_TITLES;

    await expect(
      runTrialClockSmoke({
        env: validEnvironment(),
        runVitest: async () =>
          reporterOutput([
            { title: firstTitle, status: 'passed' },
            { title: firstTitle, status: 'passed' },
            { title: secondTitle, status: 'passed' },
          ]),
      }),
    ).rejects.toThrow(`PROOF_DUPLICATE_CASE: ${firstTitle}`);
  });

  it('rejects a named case that did not pass', async () => {
    const [firstTitle, secondTitle] = TRIAL_CLOCK_SMOKE_CASE_TITLES;

    await expect(
      runTrialClockSmoke({
        env: validEnvironment(),
        runVitest: async () =>
          reporterOutput([
            { title: firstTitle, status: 'failed' },
            { title: secondTitle, status: 'passed' },
          ]),
      }),
    ).rejects.toThrow(`PROOF_CASE_NOT_PASSED: ${firstTitle}`);
  });

  it('rejects an unexpected non-passing case in the smoke file', async () => {
    await expect(
      runTrialClockSmoke({
        env: validEnvironment(),
        runVitest: async () =>
          reporterOutput([
            ...TRIAL_CLOCK_SMOKE_CASE_TITLES.map((title) => ({
              title,
              status: 'passed',
            })),
            { title: 'unexpected case', status: 'failed' },
          ]),
      }),
    ).rejects.toThrow(
      'PROOF_NONPASSING_CASE: smoke report contains 1 non-passing cases',
    );
  });
});

describe('runVitestWithJsonReporter', () => {
  it('parses the machine report and removes its scratch directory', async () => {
    const report = reporterOutput(
      TRIAL_CLOCK_SMOKE_CASE_TITLES.map((title) => ({
        title,
        status: 'passed',
      })),
    );
    let scratchDirectory: string | undefined;

    await expect(
      runVitestWithJsonReporter(validEnvironment(), async (invocation) => {
        const outputArgument = invocation.args.find((argument) =>
          argument.startsWith('--outputFile='),
        );
        if (!outputArgument) throw new Error('output file argument missing');
        const outputFile = outputArgument.slice('--outputFile='.length);
        scratchDirectory = path.dirname(outputFile);
        await writeFile(outputFile, JSON.stringify(report), 'utf8');
      }),
    ).resolves.toEqual(report);

    expect(scratchDirectory).toBeTypeOf('string');
    await expect(access(scratchDirectory ?? '')).rejects.toThrow();
  });

  it('fails closed on invalid reporter JSON and still removes scratch', async () => {
    let scratchDirectory: string | undefined;

    await expect(
      runVitestWithJsonReporter(validEnvironment(), async (invocation) => {
        const outputArgument = invocation.args.find((argument) =>
          argument.startsWith('--outputFile='),
        );
        if (!outputArgument) throw new Error('output file argument missing');
        const outputFile = outputArgument.slice('--outputFile='.length);
        scratchDirectory = path.dirname(outputFile);
        await writeFile(outputFile, 'not-json', 'utf8');
      }),
    ).rejects.toThrow(
      'PROOF_REPORT_INVALID: Vitest output file is not valid JSON',
    );

    expect(scratchDirectory).toBeTypeOf('string');
    await expect(access(scratchDirectory ?? '')).rejects.toThrow();
  });

  it('classifies a missing reporter file and still removes scratch', async () => {
    let scratchDirectory: string | undefined;

    await expect(
      runVitestWithJsonReporter(validEnvironment(), async (invocation) => {
        const outputArgument = invocation.args.find((argument) =>
          argument.startsWith('--outputFile='),
        );
        if (!outputArgument) throw new Error('output file argument missing');
        scratchDirectory = path.dirname(
          outputArgument.slice('--outputFile='.length),
        );
      }),
    ).rejects.toThrow(
      'PROOF_REPORT_MISSING: Vitest produced no readable JSON report file',
    );

    expect(scratchDirectory).toBeTypeOf('string');
    await expect(access(scratchDirectory ?? '')).rejects.toThrow();
  });
});

describe('spawnVitest', () => {
  const childEnvironment = { PATH: process.env.PATH };

  it('resolves for a successful child process', async () => {
    await expect(
      spawnVitest({
        command: process.execPath,
        args: ['-e', 'process.exit(0)'],
        env: childEnvironment,
      }),
    ).resolves.toBeUndefined();
  });

  it('reports a nonzero child exit without including environment values', async () => {
    await expect(
      spawnVitest({
        command: process.execPath,
        args: ['-e', 'process.exit(7)'],
        env: { ...childEnvironment, STRIPE_SECRET_KEY: 'do_not_print' },
      }),
    ).rejects.toThrow(
      'TRIAL_CLOCK_SMOKE_PROCESS_FAILED: Vitest ended with exit code 7',
    );
  });

  it('reports a child signal', async () => {
    await expect(
      spawnVitest({
        command: process.execPath,
        args: ['-e', "process.kill(process.pid, 'SIGTERM')"],
        env: childEnvironment,
      }),
    ).rejects.toThrow(
      'TRIAL_CLOCK_SMOKE_PROCESS_FAILED: Vitest ended with signal SIGTERM',
    );
  });

  it('classifies a child process that cannot start', async () => {
    await expect(
      spawnVitest({
        command: path.join(process.cwd(), 'no-such-binary-debt468'),
        args: [],
        env: childEnvironment,
      }),
    ).rejects.toThrow(
      'TRIAL_CLOCK_SMOKE_PROCESS_START_FAILED: unable to start Vitest',
    );
  });

  it('kills and classifies a child that exceeds its process budget', async () => {
    await expect(
      spawnVitest(
        {
          command: process.execPath,
          args: ['-e', 'setTimeout(() => {}, 250)'],
          env: childEnvironment,
        },
        10,
      ),
    ).rejects.toThrow(
      'TRIAL_CLOCK_SMOKE_PROCESS_TIMEOUT: Vitest exceeded 10ms',
    );
  });
});
