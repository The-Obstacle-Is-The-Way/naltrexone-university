import { describe, expect, it, vi } from 'vitest';
import {
  E2EUserStateResetError,
  type E2EUserStateResetServices,
  runE2EUserStateReset,
} from './reset-e2e-user-state';
import { createEnv } from './reset-e2e-user-state-test-env';

const fixtureChoice01CorrectId = crypto.randomUUID();
const fixtureChoice02IncorrectId = crypto.randomUUID();
const fixtureDbUser123Id = crypto.randomUUID();
const fixtureQuestion01Id = crypto.randomUUID();
const fixtureQuestion02Id = crypto.randomUUID();

function createServices(
  overrides: Partial<E2EUserStateResetServices> = {},
): E2EUserStateResetServices {
  const questionFixtures = {
    placeholder01Id: fixtureQuestion01Id,
    placeholder02Id: fixtureQuestion02Id,
  };
  const choiceFixtures = {
    placeholder01CorrectChoiceId: fixtureChoice01CorrectId,
    placeholder02IncorrectChoiceId: fixtureChoice02IncorrectId,
  };

  return {
    ensurePlaceholderQuestionsPublished: vi.fn(async () => {}),
    resolveAppUserIdByEmail: vi.fn(async () => fixtureDbUser123Id),
    clearUserState: vi.fn(async () => {}),
    resolveRequiredQuestionFixtures: vi.fn(async () => questionFixtures),
    resolveRequiredChoiceFixtures: vi.fn(async () => choiceFixtures),
    seedDeterministicBaseline: vi.fn(async () => {}),
    verifyDeterministicBaseline: vi.fn(async () => {}),
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

    expect(services.ensurePlaceholderQuestionsPublished).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseUrl: env.DATABASE_URL,
        sql: expect.any(Function),
      }),
    );
    expect(services.resolveAppUserIdByEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseUrl: env.DATABASE_URL,
        sql: expect.any(Function),
        email: env.E2E_CLERK_USER_USERNAME,
      }),
    );
    expect(services.clearUserState).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseUrl: env.DATABASE_URL,
        sql: expect.any(Function),
        userId: fixtureDbUser123Id,
      }),
    );
    expect(services.resolveRequiredQuestionFixtures).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseUrl: env.DATABASE_URL,
        sql: expect.any(Function),
      }),
    );
    expect(services.resolveRequiredChoiceFixtures).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseUrl: env.DATABASE_URL,
        sql: expect.any(Function),
        questionIds: {
          placeholder01Id: fixtureQuestion01Id,
          placeholder02Id: fixtureQuestion02Id,
        },
      }),
    );
    expect(services.seedDeterministicBaseline).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseUrl: env.DATABASE_URL,
        sql: expect.any(Function),
        userId: fixtureDbUser123Id,
        questionFixtures: {
          placeholder01Id: fixtureQuestion01Id,
          placeholder02Id: fixtureQuestion02Id,
        },
        choiceFixtures: {
          placeholder01CorrectChoiceId: fixtureChoice01CorrectId,
          placeholder02IncorrectChoiceId: fixtureChoice02IncorrectId,
        },
      }),
    );
    expect(services.verifyDeterministicBaseline).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseUrl: env.DATABASE_URL,
        sql: expect.any(Function),
        userId: fixtureDbUser123Id,
        questionFixtures: {
          placeholder01Id: fixtureQuestion01Id,
          placeholder02Id: fixtureQuestion02Id,
        },
      }),
    );
  });

  it('can be called repeatedly and restores the exact deterministic baseline each time', async () => {
    const env = createEnv();
    const expectedBaseline = {
      completedSessions: 1,
      attempts: 2,
      bookmarks: 1,
      idempotencyKeys: 0,
    };
    const state = {
      completedSessions: 5,
      attempts: 9,
      bookmarks: 4,
      idempotencyKeys: 7,
    };
    const observedBaselines: (typeof expectedBaseline)[] = [];
    const callOrder: string[] = [];

    const services: E2EUserStateResetServices = {
      ensurePlaceholderQuestionsPublished: async () => {},
      resolveAppUserIdByEmail: async () => fixtureDbUser123Id,
      clearUserState: async () => {
        callOrder.push('clear');
        state.completedSessions = 0;
        state.attempts = 0;
        state.bookmarks = 0;
        state.idempotencyKeys = 0;
      },
      resolveRequiredQuestionFixtures: async () => ({
        placeholder01Id: fixtureQuestion01Id,
        placeholder02Id: fixtureQuestion02Id,
      }),
      resolveRequiredChoiceFixtures: async () => ({
        placeholder01CorrectChoiceId: fixtureChoice01CorrectId,
        placeholder02IncorrectChoiceId: fixtureChoice02IncorrectId,
      }),
      seedDeterministicBaseline: async () => {
        callOrder.push('seed');
        state.completedSessions = 1;
        state.attempts = 2;
        state.bookmarks = 1;
      },
      verifyDeterministicBaseline: async () => {
        callOrder.push('verify');
        expect(state).toEqual(expectedBaseline);
        observedBaselines.push({ ...state });
      },
    };

    await expect(
      runE2EUserStateReset({
        env,
        services,
      }),
    ).resolves.toBeUndefined();

    state.completedSessions = 4;
    state.attempts = 8;
    state.bookmarks = 3;
    state.idempotencyKeys = 5;

    await expect(
      runE2EUserStateReset({
        env,
        services,
      }),
    ).resolves.toBeUndefined();

    expect(observedBaselines).toEqual([expectedBaseline, expectedBaseline]);
    expect(callOrder).toEqual([
      'clear',
      'seed',
      'verify',
      'clear',
      'seed',
      'verify',
    ]);
    expect(state).toEqual(expectedBaseline);
  });

  // DEBT-508: each test's reset ran a Clerk lookup, and concurrent runs share
  // one Clerk instance's rate budget. The seed wrote the user this run, so the
  // reset finds it by email and needs no Clerk secret at all.
  it('needs no Clerk secret, since it finds the user in the database', async () => {
    const services = createServices();

    await expect(
      runE2EUserStateReset({
        env: createEnv({ CLERK_SECRET_KEY: undefined }),
        services,
      }),
    ).resolves.toBeUndefined();
    expect(services.clearUserState).toHaveBeenCalled();
  });

  it('fails fast when app user row does not exist yet', async () => {
    const env = createEnv();
    const services = createServices({
      resolveAppUserIdByEmail: vi.fn(async () => null),
    });

    await expect(
      runE2EUserStateReset({
        env,
        services,
      }),
    ).rejects.toThrow('[E2E_RESET:APP_USER_NOT_FOUND]');

    expect(services.ensurePlaceholderQuestionsPublished).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseUrl: env.DATABASE_URL,
        sql: expect.any(Function),
      }),
    );
    expect(services.clearUserState).not.toHaveBeenCalled();
    expect(services.resolveRequiredQuestionFixtures).not.toHaveBeenCalled();
    expect(services.resolveRequiredChoiceFixtures).not.toHaveBeenCalled();
    expect(services.seedDeterministicBaseline).not.toHaveBeenCalled();
    expect(services.verifyDeterministicBaseline).not.toHaveBeenCalled();
  });

  it('fails fast with actionable missing env errors', async () => {
    const env = createEnv({
      DATABASE_URL: undefined,
      E2E_CLERK_USER_USERNAME: undefined,
    });

    const services = createServices();
    let caughtError: Error | null = null;
    try {
      await runE2EUserStateReset({
        env,
        services,
      });
    } catch (error) {
      caughtError = error as Error;
    }

    expect(caughtError).toBeInstanceOf(Error);
    const message = caughtError?.message ?? '';
    expect(message).toContain('[E2E_RESET] E2E user-state reset failed');
    expect(message).toContain('[E2E_RESET:DATABASE_URL_MISSING]');
    expect(message).toContain('[E2E_RESET:E2E_CLERK_USER_USERNAME_MISSING]');

    expect(services.ensurePlaceholderQuestionsPublished).not.toHaveBeenCalled();
    expect(services.resolveAppUserIdByEmail).not.toHaveBeenCalled();
    expect(services.clearUserState).not.toHaveBeenCalled();
    expect(services.resolveRequiredQuestionFixtures).not.toHaveBeenCalled();
    expect(services.resolveRequiredChoiceFixtures).not.toHaveBeenCalled();
    expect(services.seedDeterministicBaseline).not.toHaveBeenCalled();
    expect(services.verifyDeterministicBaseline).not.toHaveBeenCalled();
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
      resolveRequiredQuestionFixtures: vi.fn(async () => {
        throw new E2EUserStateResetError(
          'E2E_RESET:REQUIRED_QUESTION_FIXTURE_MISSING',
          'Fixture missing',
          'Run seed',
        );
      }),
    });

    await expect(
      runE2EUserStateReset({
        env,
        services,
      }),
    ).rejects.toThrow('[E2E_RESET:REQUIRED_QUESTION_FIXTURE_MISSING]');
  });
});
