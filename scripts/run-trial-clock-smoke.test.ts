import { describe, expect, it, vi } from 'vitest';
import {
  createTrialClockSmokeInvocation,
  runTrialClockSmoke,
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
});
