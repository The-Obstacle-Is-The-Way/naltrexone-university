import { describe, expect, it, vi } from 'vitest';
import {
  type E2EUserStateResetServices,
  runE2EUserStateReset,
} from './reset-e2e-user-state';

type RequiredEnvKey =
  | 'DATABASE_URL'
  | 'CLERK_SECRET_KEY'
  | 'E2E_CLERK_USER_USERNAME';

function createEnv(
  overrides: Partial<Record<RequiredEnvKey, string | undefined>> = {},
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    DATABASE_URL:
      'postgresql://postgres:postgres@localhost:5432/addiction_boards_test',
    CLERK_SECRET_KEY: 'sk_test_clerk',
    E2E_CLERK_USER_USERNAME: 'e2e-test@example.com',
    ...overrides,
  } as NodeJS.ProcessEnv;
}

function createServices(
  overrides: Partial<E2EUserStateResetServices> = {},
): E2EUserStateResetServices {
  return {
    ensurePlaceholderQuestionsPublished: vi.fn(async () => {}),
    resolveClerkUserIdByEmail: vi.fn(async () => 'user_123'),
    resolveAppUserIdByClerkUserId: vi.fn(async () => 'db_user_123'),
    clearUserState: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('runE2EUserStateReset', () => {
  it('resets mutable E2E user state when the user exists', async () => {
    const env = createEnv();
    const services = createServices();

    await expect(
      runE2EUserStateReset({
        env,
        services,
      }),
    ).resolves.toBeUndefined();

    expect(services.ensurePlaceholderQuestionsPublished).toHaveBeenCalledWith({
      databaseUrl: env.DATABASE_URL,
    });
    expect(services.resolveClerkUserIdByEmail).toHaveBeenCalledWith({
      clerkSecretKey: env.CLERK_SECRET_KEY,
      email: env.E2E_CLERK_USER_USERNAME,
    });
    expect(services.resolveAppUserIdByClerkUserId).toHaveBeenCalledWith({
      databaseUrl: env.DATABASE_URL,
      clerkUserId: 'user_123',
    });
    expect(services.clearUserState).toHaveBeenCalledWith({
      databaseUrl: env.DATABASE_URL,
      userId: 'db_user_123',
    });
  });

  it('is a no-op when clerk user does not exist', async () => {
    const env = createEnv();
    const services = createServices({
      resolveClerkUserIdByEmail: vi.fn(async () => null),
    });

    await expect(
      runE2EUserStateReset({
        env,
        services,
      }),
    ).resolves.toBeUndefined();

    expect(services.ensurePlaceholderQuestionsPublished).toHaveBeenCalledWith({
      databaseUrl: env.DATABASE_URL,
    });
    expect(services.resolveAppUserIdByClerkUserId).not.toHaveBeenCalled();
    expect(services.clearUserState).not.toHaveBeenCalled();
  });

  it('is a no-op when app user row does not exist yet', async () => {
    const env = createEnv();
    const services = createServices({
      resolveAppUserIdByClerkUserId: vi.fn(async () => null),
    });

    await expect(
      runE2EUserStateReset({
        env,
        services,
      }),
    ).resolves.toBeUndefined();

    expect(services.ensurePlaceholderQuestionsPublished).toHaveBeenCalledWith({
      databaseUrl: env.DATABASE_URL,
    });
    expect(services.clearUserState).not.toHaveBeenCalled();
  });

  it('fails fast with actionable missing env errors', async () => {
    const env = createEnv({
      DATABASE_URL: undefined,
      CLERK_SECRET_KEY: undefined,
      E2E_CLERK_USER_USERNAME: undefined,
    });

    await expect(
      runE2EUserStateReset({
        env,
        services: createServices(),
      }),
    ).rejects.toThrow('[E2E_RESET:DATABASE_URL_MISSING]');

    await expect(
      runE2EUserStateReset({
        env,
        services: createServices(),
      }),
    ).rejects.toThrow('[E2E_RESET:CLERK_SECRET_KEY_MISSING]');

    await expect(
      runE2EUserStateReset({
        env,
        services: createServices(),
      }),
    ).rejects.toThrow('[E2E_RESET:E2E_CLERK_USER_USERNAME_MISSING]');

    const services = createServices();
    await expect(
      runE2EUserStateReset({
        env,
        services,
      }),
    ).rejects.toThrow('[E2E_RESET] E2E user-state reset failed');

    expect(services.ensurePlaceholderQuestionsPublished).not.toHaveBeenCalled();
    expect(services.resolveClerkUserIdByEmail).not.toHaveBeenCalled();
    expect(services.resolveAppUserIdByClerkUserId).not.toHaveBeenCalled();
    expect(services.clearUserState).not.toHaveBeenCalled();
  });

  it('wraps unexpected errors with deterministic code', async () => {
    const env = createEnv();
    const services = createServices({
      clearUserState: vi.fn(async () => {
        throw new Error('write timeout');
      }),
    });

    await expect(
      runE2EUserStateReset({
        env,
        services,
      }),
    ).rejects.toThrow('[E2E_RESET:UNEXPECTED]');
  });

  it('surfaces fixture availability failures with explicit code', async () => {
    const env = createEnv();
    const services = createServices({
      ensurePlaceholderQuestionsPublished: vi.fn(async () => {
        throw new Error('missing fixture rows');
      }),
    });

    await expect(
      runE2EUserStateReset({
        env,
        services,
      }),
    ).rejects.toThrow('[E2E_RESET:UNEXPECTED]');
  });
});
