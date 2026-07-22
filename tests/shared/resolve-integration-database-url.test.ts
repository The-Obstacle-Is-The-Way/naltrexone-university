import { describe, expect, it } from 'vitest';
import { resolveIntegrationDatabaseUrl } from './resolve-integration-database-url';

describe('resolveIntegrationDatabaseUrl', () => {
  it('requires an explicit database URL', () => {
    expect(() =>
      resolveIntegrationDatabaseUrl({
        cwd: '/repo/a',
        env: {},
      }),
    ).toThrow('DATABASE_URL is required for database session proofs');
  });

  it('accepts the disposable CI database URL unchanged', () => {
    const databaseUrl =
      'postgresql://postgres:postgres@localhost:5432/addiction_boards_test';

    expect(
      resolveIntegrationDatabaseUrl({
        cwd: '/repo/a',
        env: { CI: 'true', DATABASE_URL: databaseUrl },
      }),
    ).toBe(databaseUrl);
  });

  it('refuses a CI database URL outside the allowlisted local service target', () => {
    expect(() =>
      resolveIntegrationDatabaseUrl({
        cwd: '/repo/a',
        env: {
          CI: 'true',
          DATABASE_URL:
            'postgresql://postgres:postgres@localhost:5433/addiction_boards_test',
        },
      }),
    ).toThrow(
      'Database session proofs require the allowlisted CI-local test target.',
    );
  });

  it('accepts the resolver-scoped local database URL', () => {
    const databaseUrl =
      'postgresql://postgres:postgres@127.0.0.1:55439/addiction_boards_test';

    expect(
      resolveIntegrationDatabaseUrl({
        cwd: '/repo/a',
        env: {
          DATABASE_URL: databaseUrl,
          DB_TEST_PORT: '55439',
          LOCAL_TEST_INSTANCE: 'integration',
        },
      }),
    ).toBe(databaseUrl);
  });

  it('refuses a local database URL outside the clone resolver target', () => {
    expect(() =>
      resolveIntegrationDatabaseUrl({
        cwd: '/repo/a',
        env: {
          DATABASE_URL:
            'postgresql://postgres:postgres@127.0.0.1:55440/addiction_boards_test',
          DB_TEST_PORT: '55439',
          LOCAL_TEST_INSTANCE: 'integration',
        },
      }),
    ).toThrow(
      'Database session proofs require the resolver-scoped local test target.',
    );
  });
});
