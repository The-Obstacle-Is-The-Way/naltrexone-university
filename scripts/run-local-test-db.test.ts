import { describe, expect, it, vi } from 'vitest';
import {
  createLocalTestDbCommandPlan,
  runLocalTestDbCommand,
} from './run-local-test-db';

describe('createLocalTestDbCommandPlan', () => {
  const env = {
    LOCAL_TEST_INSTANCE: 'dbcli',
    DB_TEST_PORT: '55438',
  };

  it('builds an isolated Compose up command', () => {
    expect(
      createLocalTestDbCommandPlan({ action: 'up', env, cwd: '/repo/a' }),
    ).toEqual([
      {
        label: 'Start isolated local test database',
        command: 'docker',
        args: [
          'compose',
          '-p',
          'naltrexone-test-dbcli',
          'up',
          '-d',
          '--wait',
          'db',
        ],
        env: {
          COMPOSE_PROJECT_NAME: 'naltrexone-test-dbcli',
          DB_TEST_PORT: '55438',
          DATABASE_URL:
            'postgresql://postgres:postgres@127.0.0.1:55438/addiction_boards_test',
          LOCAL_TEST_INSTANCE: 'dbcli',
          NEXT_PUBLIC_APP_URL: expect.stringMatching(
            /^http:\/\/127\.0\.0\.1:\d+$/,
          ),
          PORT: expect.any(String),
        },
      },
    ]);
  });

  it('builds isolated Compose down and reset commands', () => {
    expect(
      createLocalTestDbCommandPlan({ action: 'down', env, cwd: '/repo/a' }).map(
        (step) => step.args,
      ),
    ).toEqual([['compose', '-p', 'naltrexone-test-dbcli', 'down']]);
    expect(
      createLocalTestDbCommandPlan({
        action: 'reset',
        env,
        cwd: '/repo/a',
      }).map((step) => step.args),
    ).toEqual([
      ['compose', '-p', 'naltrexone-test-dbcli', 'down', '-v'],
      ['compose', '-p', 'naltrexone-test-dbcli', 'up', '-d', '--wait', 'db'],
    ]);
  });
});

describe('runLocalTestDbCommand', () => {
  it('runs the requested isolated DB command plan', async () => {
    const runPlan = vi.fn(async () => {});

    await runLocalTestDbCommand({
      argv: ['node', 'scripts/run-local-test-db.ts', 'up'],
      env: { LOCAL_TEST_INSTANCE: 'dbcli', DB_TEST_PORT: '55438' },
      cwd: '/repo/a',
      runPlan,
    });

    expect(runPlan).toHaveBeenCalledWith(
      createLocalTestDbCommandPlan({
        action: 'up',
        env: { LOCAL_TEST_INSTANCE: 'dbcli', DB_TEST_PORT: '55438' },
        cwd: '/repo/a',
      }),
      {
        env: { LOCAL_TEST_INSTANCE: 'dbcli', DB_TEST_PORT: '55438' },
      },
    );
  });

  it('rejects unknown actions before running commands', async () => {
    const runPlan = vi.fn(async () => {});

    await expect(
      runLocalTestDbCommand({
        argv: ['node', 'scripts/run-local-test-db.ts', 'destroy'],
        env: {},
        cwd: '/repo/a',
        runPlan,
      }),
    ).rejects.toThrow('Unknown local test DB action "destroy".');
    expect(runPlan).not.toHaveBeenCalled();
  });
});
