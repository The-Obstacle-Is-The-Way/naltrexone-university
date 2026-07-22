import { describe, expect, it, vi } from 'vitest';
import packageJson from '../package.json';
import {
  createE2ECommandPlan,
  resolveLocalE2EDatabaseUrl,
  runCommandPlan,
  shouldUseHermeticLocalE2E,
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

describe('shouldUseHermeticLocalE2E', () => {
  it('uses the hermetic Docker flow for local runs', () => {
    expect(shouldUseHermeticLocalE2E({})).toBe(true);
  });

  it('keeps CI on the existing Playwright path', () => {
    expect(shouldUseHermeticLocalE2E({ CI: 'true' })).toBe(false);
  });

  it('allows an explicit local deploy-target database run', () => {
    expect(
      shouldUseHermeticLocalE2E({ E2E_USE_EXISTING_DATABASE: 'true' }),
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
      },
    ]);
  });
});

describe('runCommandPlan', () => {
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
  it('routes pnpm test:e2e through the local hermetic orchestrator', () => {
    expect(packageJson.scripts['test:e2e']).toBe(
      'tsx scripts/run-local-e2e.ts',
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
});
