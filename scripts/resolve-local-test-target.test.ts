import { describe, expect, it } from 'vitest';
import {
  createLocalTestTargetEnv,
  formatLocalTestTargetOutput,
  isTruthyEnvFlag,
  parseOutputFormat,
  resolveLocalTestTarget,
} from './resolve-local-test-target';

describe('resolveLocalTestTarget', () => {
  it('derives a stable per-worktree target without using the global default ports', () => {
    const first = resolveLocalTestTarget({
      cwd: '/Users/ray/Desktop/github/naltrexone-university',
      env: {},
    });
    const again = resolveLocalTestTarget({
      cwd: '/Users/ray/Desktop/github/naltrexone-university',
      env: {},
    });
    const otherClone = resolveLocalTestTarget({
      cwd: '/Users/ray/Desktop/github/naltrexone-university-3',
      env: {},
    });

    expect(again).toEqual(first);
    expect(otherClone.composeProjectName).not.toBe(first.composeProjectName);
    expect(otherClone.appPort).not.toBe(first.appPort);
    expect(otherClone.dbPort).not.toBe(first.dbPort);
    expect(first.appPort).not.toBe('3000');
    expect(first.dbPort).not.toBe('5434');
  });

  it('honors explicit local instance and port overrides', () => {
    const target = resolveLocalTestTarget({
      cwd: '/repo/ignored-when-instance-is-explicit',
      env: {
        LOCAL_TEST_INSTANCE: 'BUG 245!',
        DB_TEST_PORT: '55434',
        LOCAL_TEST_APP_PORT: '3317',
      },
    });

    expect(target).toMatchObject({
      instanceId: 'bug-245',
      composeProjectName: 'naltrexone-test-bug-245',
      dbHost: '127.0.0.1',
      dbPort: '55434',
      dbName: 'addiction_boards_test',
      databaseUrl:
        'postgresql://postgres:postgres@127.0.0.1:55434/addiction_boards_test',
      appHost: '127.0.0.1',
      appPort: '3317',
      appUrl: 'http://127.0.0.1:3317',
    });
    expect(target.lockPath).toContain('naltrexone-test-bug-245.lock');
  });

  it('falls back to E2E_INSTANCE and PORT when the local-specific names are absent', () => {
    const target = resolveLocalTestTarget({
      cwd: '/repo/ignored-when-instance-is-explicit',
      env: {
        E2E_INSTANCE: 'Clone B',
        DB_TEST_PORT: '55435',
        PORT: '3318',
      },
    });

    expect(target.instanceId).toBe('clone-b');
    expect(target.appPort).toBe('3318');
    expect(target.dbPort).toBe('55435');
  });

  it('falls back to a safe instance id when an explicit instance sanitizes empty', () => {
    const target = resolveLocalTestTarget({
      cwd: '/repo/ignored-when-instance-is-explicit',
      env: {
        LOCAL_TEST_INSTANCE: '!!!',
      },
    });

    expect(target.instanceId).toBe('local');
    expect(target.composeProjectName).toBe('naltrexone-test-local');
  });
});

describe('isTruthyEnvFlag', () => {
  it('recognizes accepted truthy values and rejects absent or falsey values', () => {
    expect(isTruthyEnvFlag('true')).toBe(true);
    expect(isTruthyEnvFlag(' YES ')).toBe(true);
    expect(isTruthyEnvFlag('1')).toBe(true);
    expect(isTruthyEnvFlag(undefined)).toBe(false);
    expect(isTruthyEnvFlag('false')).toBe(false);
  });
});

describe('createLocalTestTargetEnv', () => {
  it('exports one consistent environment surface for Compose, DB, Next, and Playwright', () => {
    const target = resolveLocalTestTarget({
      cwd: '/repo/app',
      env: {
        LOCAL_TEST_INSTANCE: 'docs',
        DB_TEST_PORT: '55436',
        LOCAL_TEST_APP_PORT: '3319',
      },
    });

    expect(createLocalTestTargetEnv(target)).toEqual({
      COMPOSE_PROJECT_NAME: 'naltrexone-test-docs',
      DB_TEST_PORT: '55436',
      DATABASE_URL:
        'postgresql://postgres:postgres@127.0.0.1:55436/addiction_boards_test',
      LOCAL_TEST_INSTANCE: 'docs',
      NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3319',
      PORT: '3319',
    });
  });
});

describe('formatLocalTestTargetOutput', () => {
  const target = resolveLocalTestTarget({
    cwd: '/repo/app',
    env: {
      LOCAL_TEST_INSTANCE: 'docs',
      DB_TEST_PORT: '55436',
      LOCAL_TEST_APP_PORT: '3319',
    },
  });

  it('prints the database URL for shell command substitution', () => {
    expect(formatLocalTestTargetOutput(target, 'database-url')).toBe(
      'postgresql://postgres:postgres@127.0.0.1:55436/addiction_boards_test',
    );
  });

  it('prints shell exports for debugging the resolved target', () => {
    expect(formatLocalTestTargetOutput(target, 'env')).toBe(
      [
        'COMPOSE_PROJECT_NAME=naltrexone-test-docs',
        'DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55436/addiction_boards_test',
        'DB_TEST_PORT=55436',
        'LOCAL_TEST_INSTANCE=docs',
        'NEXT_PUBLIC_APP_URL=http://127.0.0.1:3319',
        'PORT=3319',
      ].join('\n'),
    );
  });

  it('prints json by default', () => {
    expect(formatLocalTestTargetOutput(target)).toBe(
      JSON.stringify(target, null, 2),
    );
  });
});

describe('parseOutputFormat', () => {
  it('accepts known formats and defaults to json', () => {
    expect(parseOutputFormat(undefined)).toBe('json');
    expect(parseOutputFormat('json')).toBe('json');
    expect(parseOutputFormat('database-url')).toBe('database-url');
    expect(parseOutputFormat('app-url')).toBe('app-url');
    expect(parseOutputFormat('env')).toBe('env');
  });

  it('rejects unknown formats', () => {
    expect(() => parseOutputFormat('yaml')).toThrow(
      'Unknown local test target output format "yaml".',
    );
  });
});
