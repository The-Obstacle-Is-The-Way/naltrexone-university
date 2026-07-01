import { describe, expect, it, vi } from 'vitest';
import {
  E2EUserStateResetError,
  type E2EUserStateResetServices,
  runE2EUserStateReset,
} from './reset-e2e-user-state';

const {
  fixtureChoice01CorrectId,
  fixtureChoice02IncorrectId,
  fixtureDbUser123Id,
  fixtureQuestion01Id,
  fixtureQuestion02Id,
} = vi.hoisted(() => ({
  fixtureChoice01CorrectId: crypto.randomUUID(),
  fixtureChoice02IncorrectId: crypto.randomUUID(),
  fixtureDbUser123Id: crypto.randomUUID(),
  fixtureQuestion01Id: crypto.randomUUID(),
  fixtureQuestion02Id: crypto.randomUUID(),
}));

const NON_SECRET_DB_ERROR = 'duplicate key value violates unique constraint';
const SENSITIVE_ERROR_PARTS = [
  'postgresql://e2e_user:super-secret-password@ep-hidden-river-123456.us-east-1.aws.neon.tech/addiction_boards?sslmode=require',
  'ep-hidden-river-123456.us-east-1.aws.neon.tech',
  'super-secret-password',
  'sk_live_clerk_secret_123',
  'sk_live_stripe_secret_456',
  'ep-hidden-river-123456',
] as const;

type RequiredEnvKey =
  | 'DATABASE_URL'
  | 'CLERK_SECRET_KEY'
  | 'E2E_CLERK_USER_USERNAME';

type UnsafeTx = {
  unsafe: ReturnType<typeof vi.fn>;
};

type BaselineRow = {
  incompleteSessionCount?: number;
  completedSessions: number;
  attemptCount: number;
  bookmarkCount: number;
  questionStateCount: number;
};

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

function createSensitiveError(message = NON_SECRET_DB_ERROR) {
  return new Error(
    `${message}; diagnostics=${SENSITIVE_ERROR_PARTS.join(' ')}`,
  );
}

function expectNoSensitiveParts(value: string) {
  for (const sensitivePart of SENSITIVE_ERROR_PARTS) {
    expect(value).not.toContain(sensitivePart);
  }
}

function createBaselineRow(overrides: Partial<BaselineRow> = {}): BaselineRow {
  return {
    completedSessions: 1,
    attemptCount: 2,
    bookmarkCount: 1,
    questionStateCount: 2,
    ...overrides,
  };
}

async function captureRejectedError(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    return error as Error;
  }

  throw new Error('Expected action to reject.');
}

function createRoutingSqlClient(
  options: {
    failQueryText?: string;
    queryFailure?: Error;
    beginFailures?: Array<Error | undefined>;
    staleOwnerRows?: unknown[];
    placeholderQuestionCount?: string;
    includeRequiredQuestionFixture?: boolean;
    includeRequiredChoiceFixture?: boolean;
    baselineRows?: BaselineRow[];
  } = {},
) {
  const beginFailures = [...(options.beginFailures ?? [])];
  const tx: UnsafeTx = {
    unsafe: vi.fn(async () => {}),
  };

  const sql = vi.fn(async (strings: TemplateStringsArray) => {
    const queryText = Array.from(strings).join(' ');

    if (options.failQueryText && queryText.includes(options.failQueryText)) {
      throw options.queryFailure ?? new Error('query failed');
    }

    if (queryText.includes('COUNT(*)::text')) {
      return [{ count: options.placeholderQuestionCount ?? '2' }];
    }

    if (queryText.includes('FROM users')) {
      return [{ id: fixtureDbUser123Id }];
    }

    if (queryText.includes('SELECT id, slug')) {
      const rows = [
        {
          id: fixtureQuestion01Id,
          slug: 'placeholder-01-naltrexone-mechanism',
        },
        {
          id: fixtureQuestion02Id,
          slug: 'placeholder-02-buprenorphine-induction-timing',
        },
      ];
      if (options.includeRequiredQuestionFixture === false) {
        return rows.slice(0, 1);
      }
      return rows;
    }

    if (queryText.includes('is_correct AS "isCorrect"')) {
      const rows = [
        {
          id: fixtureChoice01CorrectId,
          questionId: fixtureQuestion01Id,
          isCorrect: true,
        },
        {
          id: fixtureChoice02IncorrectId,
          questionId: fixtureQuestion02Id,
          isCorrect: false,
        },
      ];
      if (options.includeRequiredChoiceFixture === false) {
        return rows.filter((row) => row.isCorrect);
      }
      return rows;
    }

    if (
      queryText.includes('UNION ALL') &&
      queryText.includes('practice_sessions') &&
      queryText.includes('attempts')
    ) {
      return options.staleOwnerRows ?? [];
    }

    if (queryText.includes('completedSessions')) {
      return options.baselineRows ?? [createBaselineRow()];
    }

    return [];
  });

  return Object.assign(sql, {
    tx,
    begin: vi.fn(async (callback: (tx: UnsafeTx) => Promise<void>) => {
      const nextFailure = beginFailures.shift();
      if (nextFailure) {
        throw nextFailure;
      }
      await callback(tx);
    }),
    end: vi.fn(async () => {}),
  });
}

function mockClerkUserFetch() {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ data: [{ id: 'user_123' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

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
    resolveClerkUserIdByEmail: vi.fn(async () => 'user_123'),
    resolveAppUserIdByClerkUserId: vi.fn(async () => fixtureDbUser123Id),
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
    expect(services.resolveClerkUserIdByEmail).toHaveBeenCalledWith({
      clerkSecretKey: env.CLERK_SECRET_KEY,
      email: env.E2E_CLERK_USER_USERNAME,
    });
    expect(services.resolveAppUserIdByClerkUserId).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseUrl: env.DATABASE_URL,
        sql: expect.any(Function),
        clerkUserId: 'user_123',
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
      resolveClerkUserIdByEmail: async () => 'user_123',
      resolveAppUserIdByClerkUserId: async () => fixtureDbUser123Id,
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

  it('accepts Clerk paginated user-list response shape in the default resolver', async () => {
    const env = createEnv();
    const resolveAppUserIdByClerkUserId = vi.fn(async () => fixtureDbUser123Id);
    const services: Partial<E2EUserStateResetServices> = {
      ensurePlaceholderQuestionsPublished: vi.fn(async () => {}),
      resolveAppUserIdByClerkUserId,
      clearUserState: vi.fn(async () => {}),
      resolveRequiredQuestionFixtures: vi.fn(async () => ({
        placeholder01Id: fixtureQuestion01Id,
        placeholder02Id: fixtureQuestion02Id,
      })),
      resolveRequiredChoiceFixtures: vi.fn(async () => ({
        placeholder01CorrectChoiceId: fixtureChoice01CorrectId,
        placeholder02IncorrectChoiceId: fixtureChoice02IncorrectId,
      })),
      seedDeterministicBaseline: vi.fn(async () => {}),
      verifyDeterministicBaseline: vi.fn(async () => {}),
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'user_123' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    try {
      await expect(
        runE2EUserStateReset({
          env,
          services,
        }),
      ).resolves.toBeUndefined();

      expect(resolveAppUserIdByClerkUserId).toHaveBeenCalledWith(
        expect.objectContaining({
          databaseUrl: env.DATABASE_URL,
          sql: expect.any(Function),
          clerkUserId: 'user_123',
        }),
      );
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
      runE2EUserStateReset({
        env,
        services,
      }),
    ).rejects.toThrow('[E2E_RESET:CLERK_USER_NOT_FOUND]');

    expect(services.ensurePlaceholderQuestionsPublished).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseUrl: env.DATABASE_URL,
        sql: expect.any(Function),
      }),
    );
    expect(services.resolveAppUserIdByClerkUserId).not.toHaveBeenCalled();
    expect(services.clearUserState).not.toHaveBeenCalled();
    expect(services.resolveRequiredQuestionFixtures).not.toHaveBeenCalled();
    expect(services.resolveRequiredChoiceFixtures).not.toHaveBeenCalled();
    expect(services.seedDeterministicBaseline).not.toHaveBeenCalled();
    expect(services.verifyDeterministicBaseline).not.toHaveBeenCalled();
  });

  it('fails fast when app user row does not exist yet', async () => {
    const env = createEnv();
    const services = createServices({
      resolveAppUserIdByClerkUserId: vi.fn(async () => null),
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
      CLERK_SECRET_KEY: undefined,
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
    expect(message).toContain('[E2E_RESET:CLERK_SECRET_KEY_MISSING]');
    expect(message).toContain('[E2E_RESET:E2E_CLERK_USER_USERNAME_MISSING]');

    expect(services.ensurePlaceholderQuestionsPublished).not.toHaveBeenCalled();
    expect(services.resolveClerkUserIdByEmail).not.toHaveBeenCalled();
    expect(services.resolveAppUserIdByClerkUserId).not.toHaveBeenCalled();
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

describe('runE2EUserStateReset default service diagnostics', () => {
  let dynamicRunE2EUserStateReset: typeof runE2EUserStateReset;
  let postgresMock: ReturnType<typeof vi.fn>;

  async function importResetWithPostgresMock() {
    vi.resetModules();
    vi.restoreAllMocks();

    postgresMock = vi.fn();
    vi.doMock('postgres', () => ({
      default: postgresMock,
    }));

    ({ runE2EUserStateReset: dynamicRunE2EUserStateReset } = await import(
      './reset-e2e-user-state'
    ));
  }

  it.each([
    {
      label: 'placeholder fixture sync',
      expectedCode: 'E2E_RESET:PLACEHOLDER_FIXTURE_SYNC_FAILED',
      client: (sourceError: Error) =>
        createRoutingSqlClient({
          failQueryText: 'COUNT(*)::text',
          queryFailure: sourceError,
        }),
    },
    {
      label: 'mutable state cleanup',
      expectedCode: 'E2E_RESET:DATABASE_MUTATION_FAILED',
      client: (sourceError: Error) =>
        createRoutingSqlClient({ beginFailures: [sourceError] }),
    },
    {
      label: 'question fixture lookup',
      expectedCode: 'E2E_RESET:DATABASE_QUERY_FAILED',
      client: (sourceError: Error) =>
        createRoutingSqlClient({
          failQueryText: 'SELECT id, slug',
          queryFailure: sourceError,
        }),
    },
    {
      label: 'choice fixture lookup',
      expectedCode: 'E2E_RESET:DATABASE_QUERY_FAILED',
      client: (sourceError: Error) =>
        createRoutingSqlClient({
          failQueryText: 'is_correct AS "isCorrect"',
          queryFailure: sourceError,
        }),
    },
    {
      label: 'deterministic baseline seed',
      expectedCode: 'E2E_RESET:DATABASE_MUTATION_FAILED',
      client: (sourceError: Error) =>
        createRoutingSqlClient({ beginFailures: [undefined, sourceError] }),
    },
    {
      label: 'deterministic baseline verification',
      expectedCode: 'E2E_RESET:DATABASE_QUERY_FAILED',
      client: (sourceError: Error) =>
        createRoutingSqlClient({
          failQueryText: 'completedSessions',
          queryFailure: sourceError,
        }),
    },
  ])('surfaces, sanitizes, and preserves cause for $label failures', async ({
    expectedCode,
    client,
  }) => {
    await importResetWithPostgresMock();
    const sourceError = createSensitiveError();
    postgresMock.mockReturnValue(client(sourceError));
    const fetchSpy = mockClerkUserFetch();

    try {
      const error = await captureRejectedError(() =>
        dynamicRunE2EUserStateReset({ env: createEnv() }),
      );
      const resetError = error.cause as Error & {
        code?: string;
        cause?: unknown;
      };

      expect(error.message).toContain(`[${expectedCode}]`);
      expect(error.message).toContain(NON_SECRET_DB_ERROR);
      expect(resetError.code).toBe(expectedCode);
      expect(resetError.message).toContain(NON_SECRET_DB_ERROR);
      expect(resetError.cause).toBe(sourceError);
      expectNoSensitiveParts(error.message);
      expectNoSensitiveParts(resetError.message);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('fails stale deterministic baseline owners before seeding mutations', async () => {
    await importResetWithPostgresMock();
    const sqlClient = createRoutingSqlClient({
      staleOwnerRows: [{ baselineType: 'practice_session' }],
    });
    postgresMock.mockReturnValue(sqlClient);
    const fetchSpy = mockClerkUserFetch();

    try {
      const error = await captureRejectedError(() =>
        dynamicRunE2EUserStateReset({ env: createEnv() }),
      );

      expect(error.message).toContain('[E2E_RESET:STALE_BASELINE_OWNER]');
      expect(error.message).not.toContain(
        '[E2E_RESET:DATABASE_MUTATION_FAILED]',
      );
      expectNoSensitiveParts(error.message);
      expect(sqlClient.begin).toHaveBeenCalledTimes(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('surfaces missing placeholder questions without wrapping the explicit reset error', async () => {
    await importResetWithPostgresMock();
    const sqlClient = createRoutingSqlClient({ placeholderQuestionCount: '1' });
    postgresMock.mockReturnValue(sqlClient);

    const error = await captureRejectedError(() =>
      dynamicRunE2EUserStateReset({ env: createEnv() }),
    );

    expect(error.message).toContain('[E2E_RESET:PLACEHOLDER_FIXTURES_MISSING]');
    expect(error.message).not.toContain(
      '[E2E_RESET:PLACEHOLDER_FIXTURE_SYNC_FAILED]',
    );
    expect(sqlClient.end).toHaveBeenCalledWith({ timeout: 5 });
  });

  it('surfaces missing choice fixtures without wrapping the explicit reset error', async () => {
    await importResetWithPostgresMock();
    const sqlClient = createRoutingSqlClient({
      includeRequiredChoiceFixture: false,
    });
    postgresMock.mockReturnValue(sqlClient);
    const fetchSpy = mockClerkUserFetch();

    try {
      const error = await captureRejectedError(() =>
        dynamicRunE2EUserStateReset({ env: createEnv() }),
      );

      expect(error.message).toContain('[E2E_RESET:CHOICE_FIXTURE_MISSING]');
      expect(error.message).not.toContain('[E2E_RESET:DATABASE_QUERY_FAILED]');
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('surfaces missing published question fixtures without wrapping the explicit reset error', async () => {
    await importResetWithPostgresMock();
    const sqlClient = createRoutingSqlClient({
      includeRequiredQuestionFixture: false,
    });
    postgresMock.mockReturnValue(sqlClient);
    const fetchSpy = mockClerkUserFetch();

    try {
      const error = await captureRejectedError(() =>
        dynamicRunE2EUserStateReset({ env: createEnv() }),
      );

      expect(error.message).toContain(
        '[E2E_RESET:REQUIRED_QUESTION_FIXTURE_MISSING]',
      );
      expect(error.message).not.toContain('[E2E_RESET:DATABASE_QUERY_FAILED]');
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it.each([
    {
      label: 'leftover incomplete session',
      baselineRow: createBaselineRow({
        incompleteSessionCount: 1,
      }),
    },
    {
      label: 'extra normalized question state',
      baselineRow: createBaselineRow({
        questionStateCount: 3,
      }),
    },
    {
      label: 'stale extra rows',
      baselineRow: createBaselineRow({
        completedSessions: 2,
        attemptCount: 3,
        bookmarkCount: 2,
      }),
    },
  ])('surfaces invalid baseline verification for $label without wrapping the explicit reset error', async ({
    baselineRow,
  }) => {
    await importResetWithPostgresMock();
    const sqlClient = createRoutingSqlClient({ baselineRows: [baselineRow] });
    postgresMock.mockReturnValue(sqlClient);
    const fetchSpy = mockClerkUserFetch();

    try {
      const error = await captureRejectedError(() =>
        dynamicRunE2EUserStateReset({ env: createEnv() }),
      );

      expect(error.message).toContain('[E2E_RESET:BASELINE_STATE_INCOMPLETE]');
      expect(error.message).not.toContain('[E2E_RESET:DATABASE_QUERY_FAILED]');
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('uses one SQL client lifecycle for the reset path including app-user lookup', async () => {
    await importResetWithPostgresMock();
    const sqlClient = createRoutingSqlClient();
    postgresMock.mockReturnValue(sqlClient);
    const fetchSpy = mockClerkUserFetch();

    try {
      await expect(
        dynamicRunE2EUserStateReset({ env: createEnv() }),
      ).resolves.toBeUndefined();
    } finally {
      fetchSpy.mockRestore();
    }

    expect(postgresMock).toHaveBeenCalledTimes(1);
    expect(sqlClient.end).toHaveBeenCalledTimes(1);
    const unsafeQueries = sqlClient.tx.unsafe.mock.calls.map(([query]) =>
      String(query),
    );
    expect(
      unsafeQueries.some((query) =>
        query.includes('INSERT INTO practice_session_question_states'),
      ),
    ).toBe(true);
    const baselineQuery = sqlClient.mock.calls
      .map(([strings]) => Array.from(strings).join(' '))
      .find((query) => query.includes('"questionStateCount"'));
    expect(baselineQuery).toContain('WHERE state.practice_session_id = ');
    expect(baselineQuery).not.toContain('INNER JOIN practice_sessions');
  });
});
