import { describe, expect, it, vi } from 'vitest';
import {
  createLocalIntegrationCommandPlan,
  runLocalIntegration,
} from './run-local-integration';

describe('createLocalIntegrationCommandPlan', () => {
  it('threads the resolved local DATABASE_URL into integration tests when none is explicit', () => {
    const plan = createLocalIntegrationCommandPlan({
      cwd: '/repo/a',
      env: {
        INTEGRATION_SKIP_PREPARE: 'true',
        LOCAL_TEST_INSTANCE: 'integration',
        DB_TEST_PORT: '55439',
      },
      vitestArgs: [],
    });

    expect(plan).toEqual([
      {
        label: 'Run integration tests against isolated local test database',
        command: 'pnpm',
        args: [
          'exec',
          'vitest',
          'run',
          '--config',
          'vitest.integration.config.mts',
        ],
        env: {
          COMPOSE_PROJECT_NAME: 'naltrexone-test-integration',
          DATABASE_URL:
            'postgresql://postgres:postgres@127.0.0.1:55439/addiction_boards_test',
          DB_TEST_PORT: '55439',
          DB_TEST_POOLER_PORT: expect.any(String),
          LOCAL_TEST_INSTANCE: 'integration',
          NEXT_PUBLIC_APP_URL: expect.stringMatching(
            /^http:\/\/127\.0\.0\.1:\d+$/,
          ),
          PORT: expect.any(String),
        },
      },
    ]);
  });

  it('does not treat CI as permission to use an inherited database target', () => {
    const plan = createLocalIntegrationCommandPlan({
      cwd: '/repo/a',
      env: {
        INTEGRATION_SKIP_PREPARE: 'true',
        CI: 'true',
        LOCAL_TEST_INSTANCE: 'integration',
        DB_TEST_PORT: '55439',
        DATABASE_URL:
          'postgresql://postgres:postgres@localhost:5432/addiction_boards_test',
      },
      vitestArgs: ['--coverage'],
    });

    expect(plan[0]?.label).toBe(
      'Run integration tests against isolated local test database',
    );
    expect(plan[0]?.env?.DATABASE_URL).toBe(
      'postgresql://postgres:postgres@127.0.0.1:55439/addiction_boards_test',
    );
  });

  it('does not treat DATABASE_URL alone as permission to bypass clone isolation', () => {
    const plan = createLocalIntegrationCommandPlan({
      cwd: '/repo/a',
      env: {
        INTEGRATION_SKIP_PREPARE: 'true',
        LOCAL_TEST_INSTANCE: 'integration',
        DB_TEST_PORT: '55439',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/manual',
      },
      vitestArgs: [],
    });

    expect(plan[0]?.label).toBe(
      'Run integration tests against isolated local test database',
    );
    expect(plan[0]?.env?.DATABASE_URL).toBe(
      'postgresql://postgres:postgres@127.0.0.1:55439/addiction_boards_test',
    );
  });

  it('passes through the database URL only with the explicit integration opt-in', () => {
    expect(
      createLocalIntegrationCommandPlan({
        env: {
          INTEGRATION_USE_EXISTING_DATABASE: 'true',
          DATABASE_URL:
            'postgresql://postgres:postgres@localhost:5432/addiction_boards_test',
        },
        vitestArgs: [],
      }),
    ).toEqual([
      {
        label: 'Run integration tests',
        command: 'pnpm',
        args: [
          'exec',
          'vitest',
          'run',
          '--config',
          'vitest.integration.config.mts',
        ],
      },
    ]);
  });

  it('fails closed when integration passthrough has no database URL', () => {
    expect(() =>
      createLocalIntegrationCommandPlan({
        env: {
          INTEGRATION_SKIP_PREPARE: 'true',
          INTEGRATION_USE_EXISTING_DATABASE: 'true',
          DATABASE_URL: '   ',
        },
      }),
    ).toThrow(
      'DATABASE_URL is required when INTEGRATION_USE_EXISTING_DATABASE=true',
    );
  });

  it('treats whitespace DATABASE_URL as absent for local target selection', () => {
    const plan = createLocalIntegrationCommandPlan({
      cwd: '/repo/a',
      env: {
        INTEGRATION_SKIP_PREPARE: 'true',
        LOCAL_TEST_INSTANCE: 'integration',
        DB_TEST_PORT: '55439',
        DATABASE_URL: '   ',
      },
      vitestArgs: [],
    });

    expect(plan[0]?.label).toBe(
      'Run integration tests against isolated local test database',
    );
    expect(plan[0]?.env?.DATABASE_URL).toBe(
      'postgresql://postgres:postgres@127.0.0.1:55439/addiction_boards_test',
    );
  });
});

describe('runLocalIntegration', () => {
  it('builds and runs the integration command plan from process-like inputs', async () => {
    const runPlan = vi.fn(async () => {});
    const env = { LOCAL_TEST_INSTANCE: 'integration', DB_TEST_PORT: '55439' };

    await runLocalIntegration({
      argv: [
        'node',
        'scripts/test-lanes/run-local-integration.ts',
        '--coverage',
      ],
      cwd: '/repo/a',
      env,
      runPlan,
    });

    expect(runPlan).toHaveBeenCalledWith(
      createLocalIntegrationCommandPlan({
        cwd: '/repo/a',
        env,
        vitestArgs: ['--coverage'],
      }),
      { env },
    );
  });
});

describe('local integration preparation', () => {
  it('starts, migrates and seeds the same resolved target before Vitest, including long clone paths', () => {
    const cwd = `/repo/${'long-clone-name-'.repeat(8)}`;
    const plan = createLocalIntegrationCommandPlan({
      cwd,
      env: {},
      vitestArgs: ['--coverage'],
    });
    expect(plan.map((step) => step.command)).toEqual([
      'docker',
      'pnpm',
      'pnpm',
      'pnpm',
    ]);
    const [start, migrate, seed, test] = plan;
    expect(start?.args).toEqual(
      expect.arrayContaining(['up', '-d', '--wait', 'db', 'pgbouncer']),
    );
    expect(migrate?.args).toEqual(['db:migrate']);
    expect(seed?.args).toEqual(['db:seed']);
    expect(seed?.env?.SEED_INCLUDE_PLACEHOLDERS).toBe('true');
    expect(test?.args.at(-1)).toBe('--coverage');
    for (const step of plan) {
      expect(step.env?.DATABASE_URL).toBe(test?.env?.DATABASE_URL);
      expect(step.env?.COMPOSE_PROJECT_NAME).toBe(
        test?.env?.COMPOSE_PROJECT_NAME,
      );
    }
    expect(start?.args.slice(0, 3)).toEqual([
      'compose',
      '-p',
      test?.env?.COMPOSE_PROJECT_NAME,
    ]);
  });

  it('quick reruns skip preparation while retaining clone isolation', () => {
    const plan = createLocalIntegrationCommandPlan({
      cwd: '/repo/a',
      env: {
        INTEGRATION_SKIP_PREPARE: 'true',
        DATABASE_URL: 'postgresql://example.invalid/forbidden',
      },
    });
    expect(plan).toHaveLength(1);
    expect(plan[0]?.env?.DATABASE_URL).toContain('@127.0.0.1:');
  });
});

it('forwards its arguments to Vitest unchanged, whose own CLI reads them', async () => {
  let observed: unknown;
  const env = { INTEGRATION_SKIP_PREPARE: 'true' };
  await runLocalIntegration({
    argv: ['node', 'runner.ts', '--coverage'],
    cwd: '/repo/a',
    env,
    runPlan: async (plan) => {
      observed = plan;
    },
  });
  expect(observed).toEqual(
    createLocalIntegrationCommandPlan({
      cwd: '/repo/a',
      env,
      vitestArgs: ['--coverage'],
    }),
  );
});
