import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PRACTICE_SESSIONS_USER_INCOMPLETE_UQ,
  practiceSessionQuestionStates,
  practiceSessions,
} from '@/db/schema';
import {
  ApplicationConflictReasons,
  ApplicationError,
} from '@/src/application/errors';
import { FakePracticeSessionRepository } from '@/src/application/test-helpers/fakes';
import { createPracticeSession } from '@/src/domain/test-helpers';
import { DrizzlePracticeSessionRepository } from './drizzle-practice-session-repository';
import {
  createStateRow,
  expectStateSelectPredicate,
  restoreDrizzlePracticeSessionRepositoryTestMocks,
  type StateRow,
} from './drizzle-practice-session-repository-test-helpers';

const sessionId = crypto.randomUUID();
const userId = crypto.randomUUID();
const firstQuestionId = crypto.randomUUID();
const secondQuestionId = crypto.randomUUID();
const selectedChoiceId = crypto.randomUUID();

function createStateSelect(
  rows: readonly StateRow[],
  expectedSessionIds: readonly string[] = rows.map(
    (row) => row.practiceSessionId,
  ),
) {
  return vi.fn(() => ({
    from: () => ({
      where: (predicate: unknown) => {
        expectStateSelectPredicate(predicate, expectedSessionIds);
        return {
          orderBy: async () => rows,
        };
      },
    }),
  }));
}

describe('DrizzlePracticeSessionRepository session writes', () => {
  afterEach(restoreDrizzlePracticeSessionRepositoryTestMocks);

  it('creates a practice session and returns a mapped PracticeSession', async () => {
    const startedAt = new Date('2026-02-01T00:00:00.000Z');
    const returningRow = {
      id: sessionId,
      userId: userId,
      mode: 'exam',
      paramsJson: {
        count: 2,
        tagSlugs: [],
        difficulties: ['easy', 'hard'],
        questionIds: [firstQuestionId, secondQuestionId],
      },
      startedAt,
      endedAt: null,
    };

    const insertSessionValues = vi.fn(() => ({
      returning: async () => [returningRow],
    }));
    const stateRows = [
      createStateRow({
        practiceSessionId: sessionId,
        questionId: firstQuestionId,
        position: 0,
      }),
      createStateRow({
        practiceSessionId: sessionId,
        questionId: secondQuestionId,
        position: 1,
      }),
    ];
    const insertStateValues = vi.fn(() => ({
      returning: async () => stateRows,
    }));
    const tx = {
      insert: vi
        .fn()
        .mockReturnValueOnce({ values: insertSessionValues })
        .mockReturnValueOnce({ values: insertStateValues }),
    };

    const db = {
      transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
      query: {
        practiceSessions: {
          findFirst: async () => null,
        },
      },
      update: () => {
        throw new Error('unexpected update');
      },
    } as const;

    type RepoDb = ConstructorParameters<
      typeof DrizzlePracticeSessionRepository
    >[0];
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    const paramsJson = {
      count: 2,
      tagSlugs: [],
      difficulties: ['easy', 'hard'],
      questionIds: [firstQuestionId, secondQuestionId],
    };

    await expect(
      repo.create({ userId: userId, mode: 'exam', paramsJson }),
    ).resolves.toMatchObject({
      id: sessionId,
      userId: userId,
      mode: 'exam',
      questionIds: [firstQuestionId, secondQuestionId],
      tagFilters: [],
      difficultyFilters: ['easy', 'hard'],
      startedAt,
      endedAt: null,
    });

    expect(insertSessionValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: userId, mode: 'exam' }),
    );
    expect(insertStateValues).toHaveBeenCalledWith([
      expect.objectContaining({
        practiceSessionId: sessionId,
        questionId: firstQuestionId,
        position: 0,
      }),
      expect.objectContaining({
        practiceSessionId: sessionId,
        questionId: secondQuestionId,
        position: 1,
      }),
    ]);
  });

  it('maps unique incomplete-session constraint violations to CONFLICT', async () => {
    const insertValues = vi.fn(() => ({
      returning: async () => {
        throw {
          code: '23505',
          constraint: PRACTICE_SESSIONS_USER_INCOMPLETE_UQ,
        };
      },
    }));
    const tx = {
      insert: () => ({
        values: insertValues,
      }),
    };

    const db = {
      transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
      query: {
        practiceSessions: {
          findFirst: async () => null,
        },
      },
      update: () => {
        throw new Error('unexpected update');
      },
    } as const;

    type RepoDb = ConstructorParameters<
      typeof DrizzlePracticeSessionRepository
    >[0];
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    const paramsJson = {
      count: 2,
      tagSlugs: [],
      difficulties: ['easy'],
      questionIds: [firstQuestionId, secondQuestionId],
    };

    const promise = repo.create({ userId: userId, mode: 'exam', paramsJson });

    // The race-loser path must carry the same typed reason as the use-case
    // pre-check so the client's Resume/Abandon recovery fires on it.
    await expect(promise).rejects.toMatchObject({
      code: 'CONFLICT',
      message:
        'You already have an incomplete practice session. Resume or abandon it before starting a new one.',
      details: {
        reason: ApplicationConflictReasons.IncompleteSessionExists,
      },
    });
  });

  it('wraps unexpected insert failures in INTERNAL_ERROR with cause', async () => {
    const cause = new Error('db offline');
    const insertValues = vi.fn(() => ({
      returning: async () => {
        throw cause;
      },
    }));
    const tx = {
      insert: () => ({
        values: insertValues,
      }),
    };

    const db = {
      transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
      query: {
        practiceSessions: {
          findFirst: async () => null,
        },
      },
      update: () => {
        throw new Error('unexpected update');
      },
    } as const;

    type RepoDb = ConstructorParameters<
      typeof DrizzlePracticeSessionRepository
    >[0];
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    const promise = repo.create({
      userId: userId,
      mode: 'exam',
      paramsJson: {
        count: 2,
        tagSlugs: [],
        difficulties: ['easy'],
        questionIds: [firstQuestionId, secondQuestionId],
      },
    });

    await expect(promise).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Failed to create practice session',
    });
    const error = await promise.catch((caughtError: unknown) => caughtError);

    expect(error).toBeInstanceOf(ApplicationError);
    expect((error as Error).cause).toBe(cause);
  });

  it('returns VALIDATION_ERROR when create() is called with invalid paramsJson', async () => {
    const db = {
      query: {
        practiceSessions: {
          findFirst: async () => null,
        },
      },
      insert: () => {
        throw new Error('unexpected insert');
      },
      update: () => {
        throw new Error('unexpected update');
      },
    } as const;

    type RepoDb = ConstructorParameters<
      typeof DrizzlePracticeSessionRepository
    >[0];
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    await expect(
      repo.create({
        userId: userId,
        mode: 'tutor',
        paramsJson: {
          count: 0,
          tagSlugs: [],
          difficulties: [],
          questionIds: [],
        },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws INTERNAL_ERROR when create() does not return an inserted row', async () => {
    const tx = {
      insert: vi.fn(() => ({
        values: () => ({
          returning: async () => [],
        }),
      })),
    };
    const db = {
      transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
      query: {
        practiceSessions: {
          findFirst: async () => null,
        },
      },
      update: () => {
        throw new Error('unexpected update');
      },
    } as const;

    type RepoDb = ConstructorParameters<
      typeof DrizzlePracticeSessionRepository
    >[0];
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    const paramsJson = {
      count: 2,
      tagSlugs: [],
      difficulties: ['easy'],
      questionIds: [firstQuestionId, secondQuestionId],
    };

    await expect(
      repo.create({ userId: userId, mode: 'tutor', paramsJson }),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(tx.insert).toHaveBeenCalledTimes(1);
  });

  it('discards an incomplete practice session child-first in one transaction', async () => {
    const deleteWhere = vi.fn(async (_where: unknown) => undefined);
    const deleteFrom = vi.fn(() => ({ where: deleteWhere }));
    const tx = {
      delete: deleteFrom,
    };

    const db = {
      transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
      delete: () => {
        throw new Error('unexpected delete outside transaction');
      },
      insert: () => {
        throw new Error('unexpected insert');
      },
      query: {
        practiceSessions: {
          findFirst: async () => {
            throw new Error('unexpected findFirst');
          },
        },
      },
      update: () => {
        throw new Error('unexpected update');
      },
    } as const;

    type RepoDb = ConstructorParameters<
      typeof DrizzlePracticeSessionRepository
    >[0];
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    await expect(repo.discard(sessionId, userId)).resolves.toBeUndefined();

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'repeatable read',
    });
    expect(deleteFrom).toHaveBeenNthCalledWith(
      1,
      practiceSessionQuestionStates,
    );
    expect(deleteFrom).toHaveBeenNthCalledWith(2, practiceSessions);
    expect(deleteWhere).toHaveBeenCalledTimes(2);

    const childDeleteWhere = deleteWhere.mock.calls[0]?.[0];
    expect(childDeleteWhere).toBeDefined();
    const childDeleteSql = new PgDialect().sqlToQuery(
      childDeleteWhere as unknown as SQL,
    ).sql;
    expect(childDeleteSql).toContain(
      '"practice_session_question_states"."practice_session_id"',
    );
    expect(childDeleteSql).toContain('exists');
    expect(childDeleteSql).toContain('"practice_sessions"."user_id"');
    expect(childDeleteSql).toContain('"practice_sessions"."ended_at" is null');
  });

  it('throws NOT_FOUND when the repeatable-read snapshot has no practice session', async () => {
    const readDb = {
      query: {
        practiceSessions: {
          findFirst: vi.fn(async () => null),
        },
      },
    };
    const db = {
      transaction: vi.fn(
        async (fn: (client: typeof readDb) => Promise<unknown>) => fn(readDb),
      ),
      update: () => {
        throw new Error('unexpected update');
      },
    } as const;
    type RepoDb = ConstructorParameters<
      typeof DrizzlePracticeSessionRepository
    >[0];
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    await expect(repo.end(sessionId, userId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Practice session not found',
    });
    expect(db.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'repeatable read',
    });
  });

  it('returns the practice session loaded from one repeatable-read snapshot before updating', async () => {
    const endedAt = new Date('2026-02-01T01:02:03.000Z');
    const row = {
      id: sessionId,
      userId,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [firstQuestionId],
      },
      startedAt: new Date('2026-02-01T00:00:00.000Z'),
      endedAt: null,
    } as const;
    const snapshotState = createStateRow({
      practiceSessionId: sessionId,
      questionId: firstQuestionId,
      position: 0,
      latestSelectedChoiceId: selectedChoiceId,
      latestIsCorrect: true,
    });
    const snapshotDb = {
      query: {
        practiceSessions: {
          findFirst: vi.fn(async () => row),
        },
      },
      select: createStateSelect([snapshotState]),
    };
    const updateReturning = vi.fn(async () => [{ ...row, endedAt }]);
    const db = {
      transaction: vi.fn(
        async (fn: (client: typeof snapshotDb) => Promise<unknown>) =>
          fn(snapshotDb),
      ),
      query: {
        practiceSessions: {
          findFirst: async () => {
            throw new Error('unexpected session read outside snapshot');
          },
        },
      },
      select: () => {
        throw new Error('unexpected state read outside snapshot');
      },
      update: vi.fn(() => ({
        set: () => ({
          where: () => ({ returning: updateReturning }),
        }),
      })),
    } as const;
    type RepoDb = ConstructorParameters<
      typeof DrizzlePracticeSessionRepository
    >[0];
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    await expect(repo.end(sessionId, userId, endedAt)).resolves.toMatchObject({
      id: sessionId,
      endedAt,
      questionStates: [
        {
          questionId: firstQuestionId,
          latestSelectedChoiceId: selectedChoiceId,
          latestIsCorrect: true,
        },
      ],
    });
    expect(db.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'repeatable read',
    });
  });

  it.each([
    { currentEndedAt: null, expectedCode: 'NOT_FOUND' },
    {
      currentEndedAt: new Date('2026-02-01T01:03:00.000Z'),
      expectedCode: 'CONFLICT',
    },
  ] as const)('keeps the guarded-update fallback as $expectedCode', async ({
    currentEndedAt,
    expectedCode,
  }) => {
    const row = {
      id: sessionId,
      userId,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [firstQuestionId],
      },
      startedAt: new Date('2026-02-01T00:00:00.000Z'),
      endedAt: null,
    } as const;
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce(
        currentEndedAt === null ? null : { ...row, endedAt: currentEndedAt },
      );
    const stateRows = [
      createStateRow({
        practiceSessionId: sessionId,
        questionId: firstQuestionId,
        position: 0,
      }),
    ];
    const tx = {
      query: { practiceSessions: { findFirst } },
      select: createStateSelect(stateRows),
    };
    const db = {
      transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
      query: tx.query,
      select: tx.select,
      update: vi.fn(() => ({
        set: () => ({
          where: () => ({ returning: async () => [] }),
        }),
      })),
    } as const;
    type RepoDb = ConstructorParameters<
      typeof DrizzlePracticeSessionRepository
    >[0];
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    await expect(repo.end(sessionId, userId)).rejects.toMatchObject({
      code: expectedCode,
    });
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it('ends an active practice session', async () => {
    const now = new Date('2026-02-01T01:02:03.000Z');
    const nowFn = vi.fn(() => now);

    const row = {
      id: sessionId,
      userId: userId,
      mode: 'tutor',
      paramsJson: {
        count: 2,
        tagSlugs: [],
        difficulties: [],
        questionIds: [firstQuestionId, secondQuestionId],
      },
      startedAt: new Date('2026-02-01T00:00:00.000Z'),
      endedAt: null,
    } as const;

    const updateReturning = vi.fn(async () => [
      {
        ...row,
        endedAt: now,
      },
    ]);
    const updateWhere = vi.fn(() => ({ returning: updateReturning }));
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const update = vi.fn(() => ({ set: updateSet }));

    const readDb = {
      query: {
        practiceSessions: {
          findFirst: async () => row,
        },
      },
      select: createStateSelect([
        createStateRow({
          practiceSessionId: sessionId,
          questionId: firstQuestionId,
          position: 0,
          latestSelectedChoiceId: selectedChoiceId,
          latestIsCorrect: true,
          latestAnsweredAt: new Date('2026-02-01T00:00:01.000Z'),
        }),
        createStateRow({
          practiceSessionId: sessionId,
          questionId: secondQuestionId,
          position: 1,
        }),
      ]),
    };
    const db = {
      ...readDb,
      transaction: vi.fn(
        async (fn: (client: typeof readDb) => Promise<unknown>) => fn(readDb),
      ),
      update,
      insert: () => {
        throw new Error('unexpected insert');
      },
    } as const;

    type RepoDb = ConstructorParameters<
      typeof DrizzlePracticeSessionRepository
    >[0];
    const repo = new DrizzlePracticeSessionRepository(
      db as unknown as RepoDb,
      nowFn,
    );

    const ended = await repo.end(sessionId, userId);
    expect(ended).toMatchObject({ id: sessionId, endedAt: now });
    expect(ended.questionStates).toHaveLength(2);
    expect(
      ended.questionStates.find(
        (state) => state.questionId === firstQuestionId,
      ),
    ).toMatchObject({
      questionId: firstQuestionId,
      markedForReview: false,
      latestSelectedChoiceId: selectedChoiceId,
      latestIsCorrect: true,
    });
    expect(
      ended.questionStates.find((state) => state.questionId === firstQuestionId)
        ?.latestAnsweredAt,
    ).toEqual(new Date('2026-02-01T00:00:01.000Z'));
    expect(nowFn).toHaveBeenCalledTimes(1);
    expect(updateSet).toHaveBeenCalledWith({ endedAt: now });
  });

  it('uses an explicit endedAt when ending a practice session', async () => {
    const explicitEndedAt = new Date('2026-02-01T00:10:00.000Z');
    const nowFn = vi.fn((): Date => {
      throw new Error('unexpected clock call');
    });

    const row = {
      id: sessionId,
      userId: userId,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [firstQuestionId],
      },
      startedAt: new Date('2026-02-01T00:00:00.000Z'),
      endedAt: null,
    } as const;

    const updateReturning = vi.fn(async () => [
      {
        ...row,
        endedAt: explicitEndedAt,
      },
    ]);
    const updateWhere = vi.fn(() => ({ returning: updateReturning }));
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const update = vi.fn(() => ({ set: updateSet }));

    const readDb = {
      query: {
        practiceSessions: {
          findFirst: async () => row,
        },
      },
      select: createStateSelect([
        createStateRow({
          practiceSessionId: sessionId,
          questionId: firstQuestionId,
          position: 0,
        }),
      ]),
    };
    const db = {
      ...readDb,
      transaction: vi.fn(
        async (fn: (client: typeof readDb) => Promise<unknown>) => fn(readDb),
      ),
      update,
      insert: () => {
        throw new Error('unexpected insert');
      },
    } as const;

    type RepoDb = ConstructorParameters<
      typeof DrizzlePracticeSessionRepository
    >[0];
    const repo = new DrizzlePracticeSessionRepository(
      db as unknown as RepoDb,
      nowFn,
    );

    const ended = await repo.end(sessionId, userId, explicitEndedAt);

    expect(ended).toMatchObject({ id: sessionId, endedAt: explicitEndedAt });
    expect(updateSet).toHaveBeenCalledWith({ endedAt: explicitEndedAt });
    expect(nowFn).not.toHaveBeenCalled();
  });

  it('matches the fake already-ended end error contract', async () => {
    const row = {
      id: sessionId,
      userId: userId,
      mode: 'tutor',
      paramsJson: {
        count: 2,
        tagSlugs: [],
        difficulties: [],
        questionIds: [firstQuestionId, secondQuestionId],
      },
      startedAt: new Date('2026-02-01T00:00:00.000Z'),
      endedAt: new Date('2026-02-01T00:01:00.000Z'),
    } as const;

    const readDb = {
      query: {
        practiceSessions: {
          findFirst: async () => row,
        },
      },
    };
    const db = {
      ...readDb,
      transaction: vi.fn(
        async (fn: (client: typeof readDb) => Promise<unknown>) => fn(readDb),
      ),
      insert: () => {
        throw new Error('unexpected insert');
      },
      update: () => {
        throw new Error('unexpected update');
      },
    } as const;

    type RepoDb = ConstructorParameters<
      typeof DrizzlePracticeSessionRepository
    >[0];
    const realRepository = new DrizzlePracticeSessionRepository(
      db as unknown as RepoDb,
    );
    const fakeRepository = new FakePracticeSessionRepository([
      createPracticeSession({
        id: sessionId,
        userId,
        mode: 'tutor',
        endedAt: row.endedAt,
      }),
    ]);

    const results = await Promise.allSettled([
      realRepository.end(sessionId, userId),
      fakeRepository.end(sessionId, userId),
    ]);
    const errorShapes = results.map((result) => {
      expect(result.status).toBe('rejected');
      if (result.status !== 'rejected') {
        throw new Error('Expected already-ended end() to reject');
      }

      expect(result.reason).toBeInstanceOf(ApplicationError);
      const error = result.reason as ApplicationError;
      expect(error).toMatchObject({
        code: 'CONFLICT',
        message: 'Practice session already ended',
      });
      expect(error.details).toBeUndefined();
      return {
        code: error.code,
        message: error.message,
        reason: error.details?.reason,
      };
    });

    expect(errorShapes[1]).toEqual(errorShapes[0]);
  });
});
