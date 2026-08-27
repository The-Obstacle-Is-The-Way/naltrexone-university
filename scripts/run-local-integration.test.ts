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
      argv: ['node', 'scripts/run-local-integration.ts', '--coverage'],
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
