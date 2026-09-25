import { describe, expect, it, vi } from 'vitest';
import type { runE2EUserStateReset } from './reset-e2e-user-state';
import { createEnv } from './reset-e2e-user-state-test-env';

const fixtureChoice01CorrectId = crypto.randomUUID();
const fixtureChoice02IncorrectId = crypto.randomUUID();
const fixtureDbUser123Id = crypto.randomUUID();
const fixtureQuestion01Id = crypto.randomUUID();
const fixtureQuestion02Id = crypto.randomUUID();

const NON_SECRET_DB_ERROR = 'duplicate key value violates unique constraint';
const SENSITIVE_ERROR_PARTS = [
  'postgresql://e2e_user:super-secret-password@ep-hidden-river-123456.us-east-1.aws.neon.tech/addiction_boards?sslmode=require',
  'ep-hidden-river-123456.us-east-1.aws.neon.tech',
  'super-secret-password',
  'sk_live_clerk_secret_123',
  'sk_live_stripe_secret_456',
  'ep-hidden-river-123456',
] as const;

type UnsafeTx = {
  unsafe: ReturnType<typeof vi.fn>;
};

type BaselineRow = {
  incompleteSessionCount?: number;
  completedSessions: number;
  attemptCount: number;
  bookmarkCount: number;
  placeholderBookmarkCount: number;
  questionStateCount: number;
};

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
    placeholderBookmarkCount: 1,
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
  ])(
    'surfaces, sanitizes, and preserves cause for $label failures',
    async ({ expectedCode, client }) => {
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
    },
  );

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
      label: 'missing normalized question state',
      baselineRow: createBaselineRow({
        questionStateCount: 1,
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
    {
      label: 'bookmark attached to the wrong question',
      baselineRow: createBaselineRow({
        bookmarkCount: 1,
        placeholderBookmarkCount: 0,
      }),
    },
  ])(
    'surfaces invalid baseline verification for $label without wrapping the explicit reset error',
    async ({ baselineRow }) => {
      await importResetWithPostgresMock();
      const sqlClient = createRoutingSqlClient({ baselineRows: [baselineRow] });
      postgresMock.mockReturnValue(sqlClient);
      const fetchSpy = mockClerkUserFetch();

      try {
        const error = await captureRejectedError(() =>
          dynamicRunE2EUserStateReset({ env: createEnv() }),
        );

        expect(error.message).toContain(
          '[E2E_RESET:BASELINE_STATE_INCOMPLETE]',
        );
        expect(error.message).not.toContain(
          '[E2E_RESET:DATABASE_QUERY_FAILED]',
        );
      } finally {
        fetchSpy.mockRestore();
      }
    },
  );

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
    const practiceSessionInsert = sqlClient.tx.unsafe.mock.calls.find(
      ([query]) => String(query).includes('INSERT INTO practice_sessions'),
    );
    expect(String(practiceSessionInsert?.[0])).toContain('jsonb_build_object');
    expect(practiceSessionInsert?.[1]).toContain(fixtureQuestion01Id);
    expect(practiceSessionInsert?.[1]).toContain(fixtureQuestion02Id);
    expect(practiceSessionInsert?.[1]).not.toEqual(
      expect.arrayContaining([expect.stringContaining('"questionIds"')]),
    );
    expect(
      unsafeQueries.some((query) =>
        query.includes('INSERT INTO practice_session_question_states'),
      ),
    ).toBe(true);
    const baselineQuery = sqlClient.mock.calls
      .map(([strings]) => Array.from(strings).join(' '))
      .find((query) => query.includes('"questionStateCount"'));
    expect(baselineQuery).toContain('"incompleteSessionCount"');
    expect(baselineQuery).toContain('"placeholderBookmarkCount"');
    expect(baselineQuery).toContain('ended_at IS NULL');
    expect(baselineQuery).toContain('WHERE state.practice_session_id = ');
    expect(baselineQuery).not.toContain('INNER JOIN practice_sessions');
  });
});
