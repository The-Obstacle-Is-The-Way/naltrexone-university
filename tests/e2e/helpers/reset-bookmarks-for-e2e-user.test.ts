import { describe, expect, it, vi } from 'vitest';
import {
  E2EBookmarkResetError,
  type ResetBookmarksForE2EUserServices,
  resetBookmarksForE2EUser,
} from './reset-bookmarks-for-e2e-user';

const { fixtureDbUser123Id, fixtureQuestion01Id } = vi.hoisted(() => ({
  fixtureDbUser123Id: crypto.randomUUID(),
  fixtureQuestion01Id: crypto.randomUUID(),
}));

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
  overrides: Partial<ResetBookmarksForE2EUserServices> = {},
): ResetBookmarksForE2EUserServices {
  const bookmarkFixture = {
    placeholder01Id: fixtureQuestion01Id,
  };

  return {
    ensurePlaceholderQuestionPublished: vi.fn(async () => {}),
    resolveClerkUserIdByEmail: vi.fn(async () => 'user_123'),
    resolveAppUserIdByClerkUserId: vi.fn(async () => fixtureDbUser123Id),
    resolveBookmarkQuestionFixture: vi.fn(async () => bookmarkFixture),
    resetBookmarksToDeterministicBaseline: vi.fn(async () => {}),
    verifyDeterministicBookmarkBaseline: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('resetBookmarksForE2EUser', () => {
  it('resets bookmark rows to the deterministic baseline when the user exists', async () => {
    const env = createEnv();
    const services = createServices();

    await expect(
      resetBookmarksForE2EUser({
        env,
        services,
      }),
    ).resolves.toBeUndefined();

    expect(services.ensurePlaceholderQuestionPublished).toHaveBeenCalledWith({
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
    expect(services.resolveBookmarkQuestionFixture).toHaveBeenCalledWith({
      databaseUrl: env.DATABASE_URL,
    });
    expect(services.resetBookmarksToDeterministicBaseline).toHaveBeenCalledWith(
      {
        databaseUrl: env.DATABASE_URL,
        userId: fixtureDbUser123Id,
        questionFixtures: {
          placeholder01Id: fixtureQuestion01Id,
        },
      },
    );
    expect(services.verifyDeterministicBookmarkBaseline).toHaveBeenCalledWith({
      databaseUrl: env.DATABASE_URL,
      userId: fixtureDbUser123Id,
      questionFixtures: {
        placeholder01Id: fixtureQuestion01Id,
      },
    });
  });

  it('accepts Clerk paginated user-list response shape in the default resolver', async () => {
    const env = createEnv();
    const resolveAppUserIdByClerkUserId = vi.fn(async () => fixtureDbUser123Id);
    const services: Partial<ResetBookmarksForE2EUserServices> = {
      ensurePlaceholderQuestionPublished: vi.fn(async () => {}),
      resolveAppUserIdByClerkUserId,
      resolveBookmarkQuestionFixture: vi.fn(async () => ({
        placeholder01Id: fixtureQuestion01Id,
      })),
      resetBookmarksToDeterministicBaseline: vi.fn(async () => {}),
      verifyDeterministicBookmarkBaseline: vi.fn(async () => {}),
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'user_123' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    try {
      await expect(
        resetBookmarksForE2EUser({
          env,
          services,
        }),
      ).resolves.toBeUndefined();

      expect(resolveAppUserIdByClerkUserId).toHaveBeenCalledWith({
        databaseUrl: env.DATABASE_URL,
        clerkUserId: 'user_123',
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('fails fast when clerk user does not exist', async () => {
    const env = createEnv();
    const services = createServices({
      resolveClerkUserIdByEmail: vi.fn(async () => null),
    });

    await expect(
      resetBookmarksForE2EUser({
        env,
        services,
      }),
    ).rejects.toThrow('[E2E_BOOKMARK_RESET:CLERK_USER_NOT_FOUND]');

    expect(services.resolveAppUserIdByClerkUserId).not.toHaveBeenCalled();
    expect(services.resolveBookmarkQuestionFixture).not.toHaveBeenCalled();
    expect(
      services.resetBookmarksToDeterministicBaseline,
    ).not.toHaveBeenCalled();
    expect(services.verifyDeterministicBookmarkBaseline).not.toHaveBeenCalled();
  });

  it('fails fast when app user row does not exist yet', async () => {
    const env = createEnv();
    const services = createServices({
      resolveAppUserIdByClerkUserId: vi.fn(async () => null),
    });

    await expect(
      resetBookmarksForE2EUser({
        env,
        services,
      }),
    ).rejects.toThrow('[E2E_BOOKMARK_RESET:APP_USER_NOT_FOUND]');

    expect(services.resolveBookmarkQuestionFixture).not.toHaveBeenCalled();
    expect(
      services.resetBookmarksToDeterministicBaseline,
    ).not.toHaveBeenCalled();
    expect(services.verifyDeterministicBookmarkBaseline).not.toHaveBeenCalled();
  });

  it('fails fast with actionable missing env errors', async () => {
    const env = createEnv({
      DATABASE_URL: undefined,
      CLERK_SECRET_KEY: undefined,
      E2E_CLERK_USER_USERNAME: undefined,
    });
    const services = createServices();

    let caughtError: Error | null = null;
    try {
      await resetBookmarksForE2EUser({
        env,
        services,
      });
    } catch (error) {
      caughtError = error as Error;
    }

    expect(caughtError).toBeInstanceOf(Error);
    const message = caughtError?.message ?? '';
    expect(message).toContain(
      '[E2E_BOOKMARK_RESET] Bookmark baseline reset failed',
    );
    expect(message).toContain('[E2E_BOOKMARK_RESET:DATABASE_URL_MISSING]');
    expect(message).toContain('[E2E_BOOKMARK_RESET:CLERK_SECRET_KEY_MISSING]');
    expect(message).toContain(
      '[E2E_BOOKMARK_RESET:E2E_CLERK_USER_USERNAME_MISSING]',
    );
    expect(services.ensurePlaceholderQuestionPublished).not.toHaveBeenCalled();
    expect(services.resolveClerkUserIdByEmail).not.toHaveBeenCalled();
    expect(services.resolveAppUserIdByClerkUserId).not.toHaveBeenCalled();
    expect(services.resolveBookmarkQuestionFixture).not.toHaveBeenCalled();
    expect(
      services.resetBookmarksToDeterministicBaseline,
    ).not.toHaveBeenCalled();
    expect(services.verifyDeterministicBookmarkBaseline).not.toHaveBeenCalled();
  });

  it('wraps unexpected errors with deterministic code', async () => {
    const env = createEnv();
    const services = createServices({
      resetBookmarksToDeterministicBaseline: vi.fn(async () => {
        throw new Error('write timeout');
      }),
    });

    await expect(
      resetBookmarksForE2EUser({
        env,
        services,
      }),
    ).rejects.toThrow('[E2E_BOOKMARK_RESET:UNEXPECTED]');
  });

  it('surfaces fixture availability failures with explicit code', async () => {
    const env = createEnv();
    const services = createServices({
      resolveBookmarkQuestionFixture: vi.fn(async () => {
        throw new E2EBookmarkResetError(
          'E2E_BOOKMARK_RESET:BOOKMARK_QUESTION_FIXTURE_MISSING',
          'Fixture missing',
          'Run seed',
        );
      }),
    });

    await expect(
      resetBookmarksForE2EUser({
        env,
        services,
      }),
    ).rejects.toThrow('[E2E_BOOKMARK_RESET:BOOKMARK_QUESTION_FIXTURE_MISSING]');
  });
});
