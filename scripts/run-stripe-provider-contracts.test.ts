import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { STRIPE_CHECKOUT_CLIENT_CONTRACT_CASE_TITLES } from '@/tests/shared/stripe-checkout-client-contract-cases';
import {
  assertProviderContractsExecuted,
  createStripeProviderContractInvocation,
  loadStripeProviderEnvironment,
  runStripeProviderContracts,
  runVitestWithJsonReporter,
  STRIPE_CHECKOUT_CLIENT_CONTRACT_FILE,
  spawnVitest,
  TRIAL_CLOCK_SMOKE_CASE_TITLES,
  TRIAL_CLOCK_SMOKE_FILE,
} from './run-stripe-provider-contracts';

type SmokeEnvironment = Readonly<Record<string, string | undefined>>;

function validEnvironment(overrides: SmokeEnvironment = {}): SmokeEnvironment {
  return {
    STRIPE_SECRET_KEY: 'sk_test_contract_only',
    NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: 'price_contract_only',
    ...overrides,
  };
}

function reporterOutput(
  assertions: Array<{ title: string; status: string }>,
  checkoutAssertions: Array<{
    title: string;
    status: string;
  }> = STRIPE_CHECKOUT_CLIENT_CONTRACT_CASE_TITLES.map((title) => ({
    title,
    status: 'passed',
  })),
): unknown {
  return {
    success: true,
    testResults: [
      {
        name: `/repo/${TRIAL_CLOCK_SMOKE_FILE}`,
        status: 'passed',
        assertionResults: assertions,
      },
      {
        name: `/repo/${STRIPE_CHECKOUT_CLIENT_CONTRACT_FILE}`,
        status: 'passed',
        assertionResults: checkoutAssertions,
      },
    ],
  };
}

describe('loadStripeProviderEnvironment', () => {
  it('loads .env.local without overriding an explicitly exported value', () => {
    const observedOptions: unknown[] = [];

    loadStripeProviderEnvironment((options) => {
      observedOptions.push(options);
    });

    expect(observedOptions).toEqual([
      { path: '.env.local', override: false, quiet: true },
    ]);
  });
});

describe('createStripeProviderContractInvocation', () => {
  it('includes the credential-gated Checkout client contract in the scheduled proof', () => {
    const invocation = createStripeProviderContractInvocation(
      '/tmp/trial-clock-smoke.json',
      validEnvironment(),
    );

    expect(invocation.args).toContain(STRIPE_CHECKOUT_CLIENT_CONTRACT_FILE);
    expect(invocation.env.STRIPE_CHECKOUT_CONTRACT_PRICE_ID).toBe(
      'price_contract_only',
    );
    expect(STRIPE_CHECKOUT_CLIENT_CONTRACT_CASE_TITLES).toHaveLength(4);
  });

  it('targets only the provider contracts through a database-free config', () => {
    const invocation = createStripeProviderContractInvocation(
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
        'vitest.stripe-provider.config.mts',
        TRIAL_CLOCK_SMOKE_FILE,
        STRIPE_CHECKOUT_CLIENT_CONTRACT_FILE,
        '--testTimeout=20000',
        '--reporter=json',
        '--outputFile=/tmp/trial-clock-smoke.json',
      ],
      env: {
        ...validEnvironment(),
        RUN_STRIPE_CHECKOUT_CLIENT_CONTRACT: 'true',
        RUN_STRIPE_TRIAL_CLOCK_SMOKE: 'true',
        STRIPE_CHECKOUT_CONTRACT_PRICE_ID: 'price_contract_only',
      },
    });
  });
});

describe('captured Vitest reporter payload fixtures', () => {
  // Real payloads captured from Vitest 4.1.10's JSON reporter running the
  // actual smoke file (paths sanitized, provider error text redacted), extended
  // with the Checkout contract reporter envelope required by this runner.
  const loadFixture = async (name: string): Promise<unknown> =>
    JSON.parse(
      await readFile(
        path.join(process.cwd(), 'scripts', 'fixtures', name),
        'utf8',
      ),
    );

  it('accepts the reporter envelope when all provider cases passed', async () => {
    const report = await loadFixture('trial-clock-smoke-report-passed.json');

    expect(assertProviderContractsExecuted(report)).toEqual({
      executed: 6,
      passed: 6,
      skipped: 0,
    });
  });

  it('rejects the real skip-shaped payload that exits zero', async () => {
    const report = await loadFixture('trial-clock-smoke-report-skipped.json');

    expect(() => assertProviderContractsExecuted(report)).toThrow(
      'PROOF_SKIPPED: scheduled smoke reported 2 skipped cases',
    );
  });

  it('rejects the real mixed-failure payload from a provider timeout', async () => {
    const report = await loadFixture(
      'trial-clock-smoke-report-mixed-failure.json',
    );

    expect(() => assertProviderContractsExecuted(report)).toThrow(
      'PROOF_REPORT_INVALID',
    );
  });
});

describe('runStripeProviderContracts execution proof', () => {
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
      runStripeProviderContracts({ env: validEnvironment(), runVitest }),
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
      runStripeProviderContracts({ env: validEnvironment(), runVitest }),
    ).rejects.toThrow(
      `PROOF_MISSING_CASE: ${TRIAL_CLOCK_SMOKE_CASE_TITLES[1]}`,
    );
  });

  it('passes only when every named provider case executed and passed with zero skips', async () => {
    const report = reporterOutput(
      TRIAL_CLOCK_SMOKE_CASE_TITLES.map((title) => ({
        title,
        status: 'passed',
      })),
    );
    const runVitest = vi.fn(async () => report);

    await expect(
      runStripeProviderContracts({ env: validEnvironment(), runVitest }),
    ).resolves.toEqual({ executed: 6, passed: 6, skipped: 0 });
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
      runStripeProviderContracts({
        env: validEnvironment(),
        runVitest: async () => report,
      }),
    ).rejects.toThrow(expectedMessage);
  });

  it('rejects duplicate named cases', async () => {
    const [firstTitle, secondTitle] = TRIAL_CLOCK_SMOKE_CASE_TITLES;

    await expect(
      runStripeProviderContracts({
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
      runStripeProviderContracts({
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
      runStripeProviderContracts({
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

  it('prints a redacted per-case summary before cleanup when the child fails', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const report = {
      success: false,
      testResults: [
        {
          name: `/repo/${TRIAL_CLOCK_SMOKE_FILE}`,
          status: 'failed',
          assertionResults: [
            { title: TRIAL_CLOCK_SMOKE_CASE_TITLES[0], status: 'passed' },
            {
              title: TRIAL_CLOCK_SMOKE_CASE_TITLES[1],
              status: 'failed',
              failureMessages: [
                'Error: charge failed for cus_secret123 via sk_test_secret456 at https://dashboard.stripe.com/x\nstack line',
              ],
            },
          ],
        },
      ],
    };

    try {
      await expect(
        runVitestWithJsonReporter(validEnvironment(), async (invocation) => {
          const outputArgument = invocation.args.find((argument) =>
            argument.startsWith('--outputFile='),
          );
          if (!outputArgument) throw new Error('output file argument missing');
          await writeFile(
            outputArgument.slice('--outputFile='.length),
            JSON.stringify(report),
            'utf8',
          );
          throw new Error(
            'STRIPE_PROVIDER_PROCESS_FAILED: Vitest ended with exit code 1',
          );
        }),
      ).rejects.toThrow('STRIPE_PROVIDER_PROCESS_FAILED');

      const printed = consoleError.mock.calls.map((call) => String(call[0]));
      const failedLine = printed.find((line) =>
        line.includes(`case "${TRIAL_CLOCK_SMOKE_CASE_TITLES[1]}"`),
      );
      expect(failedLine).toContain('status=failed');
      expect(failedLine).toContain('detail=');
      expect(failedLine).not.toContain('cus_secret123');
      expect(failedLine).not.toContain('sk_test_secret456');
      expect(failedLine).not.toContain('dashboard.stripe.com');
      expect(
        printed.some((line) =>
          line.includes(`case "${TRIAL_CLOCK_SMOKE_CASE_TITLES[0]}"`),
        ),
      ).toBe(true);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('notes an unreadable report when the child fails before writing one', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    try {
      await expect(
        runVitestWithJsonReporter(validEnvironment(), async () => {
          throw new Error(
            'STRIPE_PROVIDER_PROCESS_FAILED: Vitest ended with exit code 1',
          );
        }),
      ).rejects.toThrow('STRIPE_PROVIDER_PROCESS_FAILED');

      expect(
        consoleError.mock.calls
          .map((call) => String(call[0]))
          .some((line) => line.includes('no readable JSON report')),
      ).toBe(true);
    } finally {
      consoleError.mockRestore();
    }
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

  it.skipIf(process.platform === 'win32')(
    'terminates descendant work before returning from scratch cleanup',
    async () => {
      const markerDirectory = await mkdtemp(
        path.join(tmpdir(), 'debt468-descendant-marker-'),
      );
      const markerFile = path.join(markerDirectory, 'descendant-survived');
      const intermediaryPidFile = path.join(
        markerDirectory,
        'intermediary.pid',
      );
      const descendantPidFile = path.join(markerDirectory, 'descendant.pid');
      const descendantScript = `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(markerFile)}, 'survived'), 500)`;
      const intermediaryScript = `
        const { spawn } = require('node:child_process');
        const { writeFileSync } = require('node:fs');
        writeFileSync(${JSON.stringify(intermediaryPidFile)}, String(process.pid));
        const descendant = spawn(process.execPath, ['-e', ${JSON.stringify(descendantScript)}], { stdio: 'ignore' });
        writeFileSync(${JSON.stringify(descendantPidFile)}, String(descendant.pid));
        descendant.unref();
        setInterval(() => {}, 1_000);
      `;
      let scratchDirectory: string | undefined;

      try {
        await expect(
          runVitestWithJsonReporter(validEnvironment(), async (invocation) => {
            const outputArgument = invocation.args.find((argument) =>
              argument.startsWith('--outputFile='),
            );
            if (!outputArgument) {
              throw new Error('output file argument missing');
            }
            scratchDirectory = path.dirname(
              outputArgument.slice('--outputFile='.length),
            );

            await spawnVitest(
              {
                command: process.execPath,
                args: ['-e', intermediaryScript],
                env: { PATH: process.env.PATH },
              },
              200,
            );
          }),
        ).rejects.toThrow('STRIPE_PROVIDER_PROCESS_TIMEOUT');

        expect(scratchDirectory).toBeTypeOf('string');
        await expect(access(scratchDirectory ?? '')).rejects.toThrow();
        await new Promise((resolve) => setTimeout(resolve, 650));
        await expect(access(markerFile)).rejects.toThrow();
      } finally {
        for (const pidFile of [intermediaryPidFile, descendantPidFile]) {
          try {
            const recordedPid = Number.parseInt(
              await readFile(pidFile, 'utf8'),
              10,
            );
            if (Number.isSafeInteger(recordedPid) && recordedPid > 0) {
              process.kill(recordedPid, 'SIGKILL');
            }
          } catch {
            // Best-effort test cleanup; a correctly terminated process is absent.
          }
        }
        await rm(markerDirectory, { recursive: true, force: true });
      }
    },
  );
});
