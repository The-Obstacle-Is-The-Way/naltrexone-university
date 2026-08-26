import { describe, expect, it, vi } from 'vitest';
import packageJson from '../package.json';
import {
  createE2ECommandPlan,
  type E2ECommandInvocation,
  resolveLocalE2EDatabaseUrl,
  runCommandPlan,
  shouldUseIsolatedLocalE2E,
} from './e2e-local-orchestrator';
import { runLocalE2E } from './run-local-e2e';

describe('resolveLocalE2EDatabaseUrl', () => {
  it('returns the non-secret resolved Docker Postgres URL by default', () => {
    const first = resolveLocalE2EDatabaseUrl(
      {},
      '/Users/ray/Desktop/github/naltrexone-university',
    );
    const again = resolveLocalE2EDatabaseUrl(
      {},
      '/Users/ray/Desktop/github/naltrexone-university',
    );

    expect(again).toBe(first);
    expect(first).toMatch(
      /^postgresql:\/\/postgres:postgres@127\.0\.0\.1:\d+\/addiction_boards_test$/,
    );
    expect(first).not.toBe(
      'postgresql://postgres:postgres@127.0.0.1:5434/addiction_boards_test',
    );
  });

  it('honors DB_TEST_PORT so the URL matches the isolated Compose port mapping', () => {
    expect(
      resolveLocalE2EDatabaseUrl({ DB_TEST_PORT: '5544' }, '/repo/a'),
    ).toBe(
      'postgresql://postgres:postgres@127.0.0.1:5544/addiction_boards_test',
    );
  });
});

describe('shouldUseIsolatedLocalE2E', () => {
  it('uses the database-isolated Docker flow for local runs', () => {
    expect(shouldUseIsolatedLocalE2E({})).toBe(true);
  });

  it('keeps CI on the existing Playwright path', () => {
    expect(shouldUseIsolatedLocalE2E({ CI: 'true' })).toBe(false);
  });

  it('allows an explicit local deploy-target database run', () => {
    expect(
      shouldUseIsolatedLocalE2E({ E2E_USE_EXISTING_DATABASE: 'true' }),
    ).toBe(false);
  });
});

describe('createE2ECommandPlan', () => {
  it('builds the isolated local Docker migrate seed Playwright sequence', () => {
    const plan = createE2ECommandPlan({
      cwd: '/repo/a',
      env: {
        LOCAL_TEST_INSTANCE: 'bug245',
        DB_TEST_PORT: '5544',
        LOCAL_TEST_APP_PORT: '3301',
      },
      playwrightArgs: ['tests/e2e/smoke.spec.ts', '--project=chromium'],
    });
    const dockerUrl =
      'postgresql://postgres:postgres@127.0.0.1:5544/addiction_boards_test';
    const targetEnv = {
      COMPOSE_PROJECT_NAME: 'naltrexone-test-bug245',
      DATABASE_URL: dockerUrl,
      DB_TEST_PORT: '5544',
      LOCAL_TEST_INSTANCE: 'bug245',
      NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3301',
      PORT: '3301',
    };

    expect(plan.map((step) => step.label)).toEqual([
      'Start isolated local Docker test database',
      'Migrate isolated local Docker test database',
      'Seed isolated local Docker test database',
      'Run Playwright E2E against isolated local test target',
    ]);
    expect(plan[0]).toMatchObject({
      command: 'pnpm',
      args: ['exec', 'tsx', 'scripts/ensure-local-test-db.ts'],
      env: targetEnv,
    });
    expect(plan[1]).toMatchObject({
      command: 'pnpm',
      args: ['exec', 'tsx', 'scripts/internal/run-managed-db-migrate.ts'],
      env: targetEnv,
    });
    expect(plan[2]).toMatchObject({
      command: 'pnpm',
      args: ['exec', 'tsx', 'scripts/internal/run-managed-db-seed.ts'],
      env: {
        ...targetEnv,
        SEED_INCLUDE_PLACEHOLDERS: 'true',
      },
    });
    expect(plan[3]).toMatchObject({
      command: 'pnpm',
      args: [
        'exec',
        'playwright',
        'test',
        'tests/e2e/smoke.spec.ts',
        '--project=chromium',
      ],
      env: targetEnv,
      omitInheritedEnv: ['NO_COLOR'],
    });
    expect(JSON.stringify(plan)).not.toContain('kill -9');
    expect(JSON.stringify(plan)).not.toContain('lsof -ti:3000');
  });

  it('does not start Docker or override DATABASE_URL in CI', () => {
    const plan = createE2ECommandPlan({
      env: {
        CI: 'true',
        DATABASE_URL:
          'postgresql://postgres:postgres@localhost:5432/addiction_boards_test',
      },
      playwrightArgs: ['tests/e2e/practice.spec.ts'],
    });

    expect(plan).toEqual([
      {
        label: 'Run Playwright E2E',
        command: 'pnpm',
        args: ['exec', 'playwright', 'test', 'tests/e2e/practice.spec.ts'],
        omitInheritedEnv: ['NO_COLOR'],
      },
    ]);
  });

  it('does not start Docker or override DATABASE_URL for explicit deploy-target runs', () => {
    const plan = createE2ECommandPlan({
      env: {
        E2E_USE_EXISTING_DATABASE: 'true',
        DATABASE_URL: 'postgresql://deploy-target.example/app',
      },
      playwrightArgs: [],
    });

    expect(plan).toEqual([
      {
        label: 'Run Playwright E2E',
        command: 'pnpm',
        args: ['exec', 'playwright', 'test'],
        omitInheritedEnv: ['NO_COLOR'],
      },
    ]);
  });
});

describe('runCommandPlan', () => {
  it('omits inherited NO_COLOR only from the Playwright child environment', async () => {
    const invocations: E2ECommandInvocation[] = [];
    const runCommand = vi.fn(async (invocation: E2ECommandInvocation) => {
      invocations.push(invocation);
    });
    const baseEnv = {
      NO_COLOR: '1',
      CLERK_SECRET_KEY: 'sk_test_clerk',
    };
    const plan = createE2ECommandPlan({
      cwd: '/repo/a',
      env: {
        LOCAL_TEST_INSTANCE: 'bug245',
        DB_TEST_PORT: '5544',
        LOCAL_TEST_APP_PORT: '3301',
      },
      playwrightArgs: ['tests/e2e/smoke.spec.ts'],
    });

    await runCommandPlan(plan, {
      env: baseEnv,
      runCommand,
    });

    expect(invocations).toHaveLength(4);
    for (const invocation of invocations.slice(0, 3)) {
      expect(invocation?.env).toMatchObject({ NO_COLOR: '1' });
    }
    expect(invocations[3]?.args).toContain('playwright');
    expect(invocations[3]?.env).not.toHaveProperty('NO_COLOR');
  });

  it('executes steps in order and merges per-step environment overrides', async () => {
    const runCommand = vi.fn(async () => {});
    const baseEnv = {
      DATABASE_URL: 'postgresql://remote.example/app',
      CLERK_SECRET_KEY: 'sk_test_clerk',
    };

    await runCommandPlan(
      [
        {
          label: 'first',
          command: 'pnpm',
          args: ['db:migrate'],
          env: { DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1/db' },
        },
        {
          label: 'second',
          command: 'pnpm',
          args: ['exec', 'playwright', 'test'],
        },
      ],
      {
        env: baseEnv,
        runCommand,
      },
    );

    expect(runCommand).toHaveBeenCalledTimes(2);
    expect(runCommand).toHaveBeenNthCalledWith(1, {
      label: 'first',
      command: 'pnpm',
      args: ['db:migrate'],
      env: {
        ...baseEnv,
        DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1/db',
      },
    });
    expect(runCommand).toHaveBeenNthCalledWith(2, {
      label: 'second',
      command: 'pnpm',
      args: ['exec', 'playwright', 'test'],
      env: baseEnv,
    });
  });

  it('uses the default child-process runner when no command runner is injected', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(
      runCommandPlan([
        {
          label: 'node success',
          command: process.execPath,
          args: ['-e', 'process.exit(0)'],
        },
      ]),
    ).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledWith('[local-e2e] node success');
    log.mockRestore();
  });

  it('reports the failing step when the default child-process runner exits nonzero', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(
      runCommandPlan([
        {
          label: 'node failure',
          command: process.execPath,
          args: ['-e', 'process.exit(7)'],
        },
      ]),
    ).rejects.toThrow(
      `Command failed during "node failure": ${process.execPath} -e process.exit(7) (exit code 7).`,
    );

    log.mockRestore();
  });
});

describe('runLocalE2E', () => {
  it('builds the command plan from process-like inputs and executes it', async () => {
    const createPlan = vi.fn(() => [
      {
        label: 'run',
        command: 'pnpm',
        args: ['exec', 'playwright', 'test'],
      },
    ]);
    const runPlan = vi.fn(async () => {});
    const env = { CI: 'true' };

    await runLocalE2E({
      argv: ['node', 'scripts/run-local-e2e.ts', '--project=chromium'],
      env,
      createPlan,
      runPlan,
    });

    expect(createPlan).toHaveBeenCalledWith({
      env,
      playwrightArgs: ['--project=chromium'],
    });
    expect(runPlan).toHaveBeenCalledWith(createPlan.mock.results[0]?.value, {
      env,
    });
  });
});

describe('package scripts', () => {
  it('loads browser tests through the native-ESM config', () => {
    expect(packageJson.scripts['test:browser']).toBe(
      'vitest run --config vitest.browser.config.mts',
    );
    expect(packageJson.scripts['test:browser:coverage']).toBe(
      'vitest run --config vitest.browser.config.mts --coverage',
    );
  });

  it('fails both lint entry points when Biome reports a warning', () => {
    expect(packageJson.scripts.lint).toBe('biome check . --error-on-warnings');
    expect(packageJson.scripts['lint:ci']).toBe(
      'biome ci . --error-on-warnings',
    );
  });

  it('routes both E2E lanes through the database-isolated local orchestrator', () => {
    expect(packageJson.scripts['test:e2e']).toBe(
      'tsx scripts/run-local-e2e.ts --project=chromium',
    );
    expect(packageJson.scripts['test:e2e:stripe-hosted']).toBe(
      'tsx scripts/run-local-e2e.ts --project=stripe-hosted',
    );
  });

  it('routes local integration and DB lifecycle scripts through the local target resolver', () => {
    expect(packageJson.scripts['test:integration']).toBe(
      'tsx scripts/run-local-integration.ts',
    );
    expect(packageJson.scripts['test:integration:coverage']).toBe(
      'tsx scripts/run-local-integration.ts --coverage',
    );
    expect(packageJson.scripts['db:test:up']).toBe(
      'tsx scripts/run-local-test-db.ts up',
    );
    expect(packageJson.scripts['db:test:down']).toBe(
      'tsx scripts/run-local-test-db.ts down',
    );
    expect(packageJson.scripts['db:test:reset']).toBe(
      'tsx scripts/run-local-test-db.ts reset',
    );
    expect(packageJson.scripts['local:test:target']).toBe(
      'tsx scripts/resolve-local-test-target.ts',
    );
  });

  it('exposes the fail-closed Stripe provider contracts through the dedicated runner', () => {
    expect(packageJson.scripts['test:stripe-provider']).toBe(
      'tsx scripts/run-stripe-provider-contracts.ts',
    );
  });
});
