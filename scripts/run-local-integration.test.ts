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
          'vitest.integration.config.ts',
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

  it('passes through CI without overriding DATABASE_URL', () => {
    expect(
      createLocalIntegrationCommandPlan({
        env: {
          CI: 'true',
          DATABASE_URL:
            'postgresql://postgres:postgres@localhost:5432/addiction_boards_test',
        },
        vitestArgs: ['--coverage'],
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
          'vitest.integration.config.ts',
          '--coverage',
        ],
      },
    ]);
  });

  it('passes through an explicitly provided DATABASE_URL for intentional target runs', () => {
    expect(
      createLocalIntegrationCommandPlan({
        env: {
          DATABASE_URL: 'postgresql://postgres:postgres@localhost:5434/manual',
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
          'vitest.integration.config.ts',
        ],
      },
    ]);
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
