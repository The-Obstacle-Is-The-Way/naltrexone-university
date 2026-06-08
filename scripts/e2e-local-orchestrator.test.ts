import { describe, expect, it, vi } from 'vitest';
import packageJson from '../package.json';
import {
  createE2ECommandPlan,
  resolveLocalE2EDatabaseUrl,
  runCommandPlan,
  shouldUseHermeticLocalE2E,
} from './e2e-local-orchestrator';

describe('resolveLocalE2EDatabaseUrl', () => {
  it('returns the non-secret Docker Postgres URL by default', () => {
    expect(resolveLocalE2EDatabaseUrl({})).toBe(
      'postgresql://postgres:postgres@127.0.0.1:5434/addiction_boards_test',
    );
  });

  it('honors DB_TEST_PORT so the URL matches docker-compose.yml port mapping', () => {
    expect(resolveLocalE2EDatabaseUrl({ DB_TEST_PORT: '5544' })).toBe(
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
  it('builds the local Docker migrate seed Playwright sequence', () => {
    const plan = createE2ECommandPlan({
      env: { DB_TEST_PORT: '5544' },
      playwrightArgs: ['tests/e2e/smoke.spec.ts', '--project=chromium'],
    });
    const dockerUrl =
      'postgresql://postgres:postgres@127.0.0.1:5544/addiction_boards_test';

    expect(plan.map((step) => step.label)).toEqual([
      'Stop stale local Next.js server on :3000',
      'Start local Docker test database',
      'Migrate local Docker test database',
      'Seed local Docker test database',
      'Run Playwright E2E against local Docker test database',
    ]);
    expect(plan[0]).toMatchObject({
      command: 'sh',
      args: ['-c', 'lsof -ti:3000 | xargs kill -9 2>/dev/null || true'],
    });
    expect(plan[1]).toMatchObject({
      command: 'pnpm',
      args: ['exec', 'tsx', 'scripts/ensure-local-test-db.ts'],
    });
    expect(plan[2]).toMatchObject({
      command: 'pnpm',
      args: ['db:migrate'],
      env: { DATABASE_URL: dockerUrl },
    });
    expect(plan[3]).toMatchObject({
      command: 'pnpm',
      args: ['db:seed'],
      env: {
        DATABASE_URL: dockerUrl,
        SEED_INCLUDE_PLACEHOLDERS: 'true',
      },
    });
    expect(plan[4]).toMatchObject({
      command: 'pnpm',
      args: [
        'exec',
        'playwright',
        'test',
        'tests/e2e/smoke.spec.ts',
        '--project=chromium',
      ],
      env: { DATABASE_URL: dockerUrl },
    });
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
});

describe('package scripts', () => {
  it('routes pnpm test:e2e through the local hermetic orchestrator', () => {
    expect(packageJson.scripts['test:e2e']).toBe(
      'tsx scripts/run-local-e2e.ts',
    );
  });
});
