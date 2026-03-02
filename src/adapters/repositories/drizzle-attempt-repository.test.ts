import { describe, expect, it, vi } from 'vitest';
import { ATTEMPTS_SESSION_QUESTION_UQ, practiceSessions } from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import { DrizzleAttemptRepository } from './drizzle-attempt-repository';

type RepoDb = ConstructorParameters<typeof DrizzleAttemptRepository>[0];

function collectColumnNamesForTable(
  node: unknown,
  table: unknown,
): readonly string[] {
  const names = new Set<string>();

  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') {
      return;
    }

    const maybeNode = value as {
      table?: unknown;
      name?: unknown;
      queryChunks?: unknown[];
    };

    if (maybeNode.table === table && typeof maybeNode.name === 'string') {
      names.add(maybeNode.name);
    }

    if (Array.isArray(maybeNode.queryChunks)) {
      for (const chunk of maybeNode.queryChunks) {
        visit(chunk);
      }
    }
  };

  visit(node);
  return [...names];
}

function createDbMock() {
  const insertReturning = vi.fn();
  const insertValues = vi.fn(() => ({ returning: insertReturning }));
  const insert = vi.fn(() => ({ values: insertValues }));

  const queryFindMany = vi.fn();

  const countWhere = vi.fn(async (): Promise<Array<{ count: number }>> => []);
  const countLeftJoin = vi.fn(() => ({
    leftJoin: countLeftJoin,
    where: countWhere,
  }));
  const countFrom = vi.fn(() => ({
    leftJoin: countLeftJoin,
    where: countWhere,
  }));
  const groupByExecute = vi.fn(
    async (): Promise<
      Array<{ questionId: string; answeredAt: Date | null }>
    > => [],
  );
  const recentQueryExecute = vi.fn(
    async (): Promise<
      Array<{
        id: string;
        userId: string;
        questionId: string;
        practiceSessionId: string | null;
        selectedChoiceId: string | null;
        isCorrect: boolean;
        timeSpentSeconds: number;
        answeredAt: Date;
        sessionMode: 'tutor' | 'exam' | null;
      }>
    > => [],
  );
  const finalQueryExecute = vi.fn(
    async (): Promise<
      Array<{
        questionId: string;
        answeredAt: Date | null;
        isCorrect: boolean;
        sessionId: string | null;
        sessionMode: 'tutor' | 'exam' | null;
      }>
    > => [],
  );

  const groupByAs = vi.fn((alias: string) => ({
    __alias: alias,
    __isLatestAttemptByQuestion: true,
    questionId: Symbol.for(`${alias}.questionId`),
    answeredAt: Symbol.for(`${alias}.answeredAt`),
  }));

  const latestRowsAs = vi.fn((alias: string) => ({
    __alias: alias,
    __isLatestAttemptRows: true,
    questionId: Symbol.for(`${alias}.questionId`),
    answeredAt: Symbol.for(`${alias}.answeredAt`),
    practiceSessionId: Symbol.for(`${alias}.practiceSessionId`),
    isCorrect: Symbol.for(`${alias}.isCorrect`),
    attemptRank: Symbol.for(`${alias}.attemptRank`),
  }));

  const groupBy = vi.fn(() => {
    const promise = groupByExecute();
    return Object.assign(promise, {
      as: groupByAs,
    });
  });

  const whereGroupBy = vi.fn(() => ({ groupBy, as: latestRowsAs }));

  const offset = vi.fn(() => finalQueryExecute());
  const limit = vi.fn(() => ({ offset }));
  const orderBy = vi.fn(() => ({ limit }));
  const whereFinal = vi.fn(() => ({ orderBy }));
  const leftJoinFinal = vi.fn(() => ({
    leftJoin: leftJoinFinal,
    where: whereFinal,
  }));

  const recentLimit = vi.fn(() => recentQueryExecute());
  const recentOrderBy = vi.fn(() => ({ limit: recentLimit }));
  const recentWhere = vi.fn(() => ({ orderBy: recentOrderBy }));
  const leftJoinRecent = vi.fn(() => ({ where: recentWhere }));
  const innerJoin = vi.fn(() => ({ where: whereFinal }));

  const from = vi.fn((table: unknown) => {
    if (
      typeof table === 'object' &&
      table !== null &&
      '__isLatestAttemptRows' in table
    ) {
      return {
        leftJoin: leftJoinFinal,
      };
    }

    if (
      typeof table === 'object' &&
      table !== null &&
      '__isLatestAttemptByQuestion' in table
    ) {
      return {
        innerJoin,
      };
    }

    return {
      leftJoin: leftJoinRecent,
      where: whereGroupBy,
    };
  });

  const select = vi.fn((fields: Record<string, unknown>) => {
    if ('count' in fields) {
      return {
        from: countFrom,
      };
    }

    return { from };
  });

  return {
    insert,
    query: {
      attempts: {
        findMany: queryFindMany,
      },
    },
    select,
    _mocks: {
      insertReturning,
      insertValues,
      queryFindMany,
      select,
      from,
      countWhere,
      countLeftJoin,
      countFrom,
      whereGroupBy,
      latestRowsAs,
      groupBy,
      groupByAs,
      groupByExecute,
      recentQueryExecute,
      innerJoin,
      leftJoinFinal,
      leftJoinRecent,
      recentWhere,
      recentOrderBy,
      recentLimit,
      whereFinal,
      orderBy,
      limit,
      offset,
      finalQueryExecute,
    },
  } as const;
}

describe('DrizzleAttemptRepository', () => {
  describe('insert', () => {
    it('returns the inserted attempt', async () => {
      const db = createDbMock();
      const answeredAt = new Date('2026-02-01T00:00:00Z');
      db._mocks.insertReturning.mockResolvedValue([
        {
          id: 'attempt_1',
          userId: 'user_1',
          questionId: 'question_1',
          practiceSessionId: 'session_1',
          selectedChoiceId: 'choice_1',
          isCorrect: true,
          timeSpentSeconds: 42,
          answeredAt,
        },
      ]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(
        repo.insert({
          userId: 'user_1',
          questionId: 'question_1',
          practiceSessionId: 'session_1',
          selectedChoiceId: 'choice_1',
          isCorrect: true,
          timeSpentSeconds: 42,
        }),
      ).resolves.toEqual({
        id: 'attempt_1',
        userId: 'user_1',
        questionId: 'question_1',
        practiceSessionId: 'session_1',
        selectedChoiceId: 'choice_1',
        isCorrect: true,
        timeSpentSeconds: 42,
        retryOfAttemptId: null,
        retryOrigin: null,
        retrySessionId: null,
        answeredAt,
      });

      expect(db._mocks.insertValues).toHaveBeenCalledWith({
        userId: 'user_1',
        questionId: 'question_1',
        practiceSessionId: 'session_1',
        selectedChoiceId: 'choice_1',
        isCorrect: true,
        timeSpentSeconds: 42,
        retryOfAttemptId: null,
        retryOrigin: null,
        retrySessionId: null,
      });
    });

    it('throws INTERNAL_ERROR when insert returns no row', async () => {
      const db = createDbMock();
      db._mocks.insertReturning.mockResolvedValue([]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      const promise = repo.insert({
        userId: 'user_1',
        questionId: 'question_1',
        practiceSessionId: null,
        selectedChoiceId: 'choice_1',
        isCorrect: true,
        timeSpentSeconds: 10,
      });

      await expect(promise).rejects.toBeInstanceOf(ApplicationError);
      await expect(promise).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    });

    it('throws INTERNAL_ERROR when selectedChoiceId is missing', async () => {
      const db = createDbMock();
      db._mocks.insertReturning.mockResolvedValue([
        {
          id: 'attempt_1',
          userId: 'user_1',
          questionId: 'question_1',
          practiceSessionId: null,
          selectedChoiceId: null,
          isCorrect: false,
          timeSpentSeconds: 5,
          answeredAt: new Date('2026-02-01T00:00:00Z'),
        },
      ]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      const promise = repo.insert({
        userId: 'user_1',
        questionId: 'question_1',
        practiceSessionId: null,
        selectedChoiceId: 'choice_1',
        isCorrect: false,
        timeSpentSeconds: 5,
      });

      await expect(promise).rejects.toBeInstanceOf(ApplicationError);
      await expect(promise).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    });

    it('maps unique-constraint violations to CONFLICT', async () => {
      const db = createDbMock();
      db._mocks.insertReturning.mockRejectedValue({
        code: '23505',
        constraint: ATTEMPTS_SESSION_QUESTION_UQ,
      });

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      const promise = repo.insert({
        userId: 'user_1',
        questionId: 'question_1',
        practiceSessionId: 'session_1',
        selectedChoiceId: 'choice_1',
        isCorrect: true,
        timeSpentSeconds: 12,
      });

      await expect(promise).rejects.toEqual(
        new ApplicationError(
          'CONFLICT',
          'This question has already been answered in this session',
        ),
      );
    });

    it('rethrows unique violations from other constraints', async () => {
      const db = createDbMock();
      const error = {
        code: '23505',
        constraint: 'some_other_unique_constraint',
      };
      db._mocks.insertReturning.mockRejectedValue(error);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      const promise = repo.insert({
        userId: 'user_1',
        questionId: 'question_1',
        practiceSessionId: 'session_1',
        selectedChoiceId: 'choice_1',
        isCorrect: true,
        timeSpentSeconds: 12,
      });

      await expect(promise).rejects.toBe(error);
    });
  });

  describe('findByUserId', () => {
    it('returns attempts mapped to domain objects', async () => {
      const db = createDbMock();
      const answeredAt = new Date('2026-02-01T00:00:00Z');
      db._mocks.queryFindMany.mockResolvedValue([
        {
          id: 'attempt_1',
          userId: 'user_1',
          questionId: 'question_1',
          practiceSessionId: null,
          selectedChoiceId: 'choice_1',
          isCorrect: true,
          timeSpentSeconds: 12,
          answeredAt,
        },
      ]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(
        repo.findByUserId('user_1', { limit: 10, offset: 0 }),
      ).resolves.toEqual([
        {
          id: 'attempt_1',
          userId: 'user_1',
          questionId: 'question_1',
          practiceSessionId: null,
          selectedChoiceId: 'choice_1',
          isCorrect: true,
          timeSpentSeconds: 12,
          retryOfAttemptId: null,
          retryOrigin: null,
          retrySessionId: null,
          answeredAt,
        },
      ]);

      expect(db._mocks.queryFindMany).toHaveBeenCalledTimes(1);
      expect(db._mocks.queryFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10, offset: 0 }),
      );
    });

    it('returns empty array without hitting the database when limit is <= 0', async () => {
      const db = createDbMock();
      db._mocks.queryFindMany.mockResolvedValue([]);
      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(
        repo.findByUserId('user_1', { limit: 0, offset: 0 }),
      ).resolves.toEqual([]);

      expect(db._mocks.queryFindMany).not.toHaveBeenCalled();
    });

    it('clamps negative offsets to 0', async () => {
      const db = createDbMock();
      db._mocks.queryFindMany.mockResolvedValue([]);
      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await repo.findByUserId('user_1', { limit: 10, offset: -5 });

      expect(db._mocks.queryFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10, offset: 0 }),
      );
    });

    it('throws INTERNAL_ERROR when selectedChoiceId is missing', async () => {
      const db = createDbMock();
      db._mocks.queryFindMany.mockResolvedValue([
        {
          id: 'attempt_1',
          selectedChoiceId: null,
          userId: 'user_1',
          questionId: 'question_1',
          practiceSessionId: null,
          isCorrect: false,
          timeSpentSeconds: 1,
          answeredAt: new Date('2026-02-01T00:00:00Z'),
        },
      ]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      const promise = repo.findByUserId('user_1', { limit: 10, offset: 0 });
      await expect(promise).rejects.toBeInstanceOf(ApplicationError);
      await expect(promise).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    });
  });

  describe('findBySessionId', () => {
    it('returns attempts for the session mapped to domain objects', async () => {
      const db = createDbMock();
      const answeredAt = new Date('2026-02-01T00:00:00Z');
      db._mocks.queryFindMany.mockResolvedValue([
        {
          id: 'attempt_1',
          userId: 'user_1',
          questionId: 'question_1',
          practiceSessionId: 'session_1',
          selectedChoiceId: 'choice_1',
          isCorrect: false,
          timeSpentSeconds: 9,
          answeredAt,
        },
      ]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(
        repo.findBySessionId('session_1', 'user_1'),
      ).resolves.toEqual([
        {
          id: 'attempt_1',
          userId: 'user_1',
          questionId: 'question_1',
          practiceSessionId: 'session_1',
          selectedChoiceId: 'choice_1',
          isCorrect: false,
          timeSpentSeconds: 9,
          retryOfAttemptId: null,
          retryOrigin: null,
          retrySessionId: null,
          answeredAt,
        },
      ]);
      expect(db._mocks.queryFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 500,
        }),
      );
      const [findBySessionArgs] = db._mocks.queryFindMany.mock.calls[0] as [
        { orderBy?: unknown },
      ];
      expect(Array.isArray(findBySessionArgs.orderBy)).toBe(true);
      expect(findBySessionArgs.orderBy).toHaveLength(2);
    });
  });

  describe('findMostRecentAnsweredAtByQuestionIds', () => {
    it('returns empty array without hitting the database when no ids provided', async () => {
      const db = createDbMock();
      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(
        repo.findMostRecentAnsweredAtByQuestionIds('user_1', []),
      ).resolves.toEqual([]);

      expect(db._mocks.select).not.toHaveBeenCalled();
    });

    it('returns only rows with answeredAt values', async () => {
      const db = createDbMock();
      const answeredAt = new Date('2026-02-01T00:00:00Z');
      db._mocks.groupByExecute.mockResolvedValue([
        { questionId: 'q1', answeredAt },
        { questionId: 'q2', answeredAt: null },
      ]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(
        repo.findMostRecentAnsweredAtByQuestionIds('user_1', ['q1', 'q2']),
      ).resolves.toEqual([{ questionId: 'q1', answeredAt }]);
    });
  });

  describe('count*', () => {
    it('returns count values from the database', async () => {
      const db = createDbMock();
      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      db._mocks.countWhere
        .mockResolvedValueOnce([{ count: 10 }])
        .mockResolvedValueOnce([{ count: 7 }])
        .mockResolvedValueOnce([{ count: 3 }])
        .mockResolvedValueOnce([{ count: 2 }]);

      await expect(repo.countByUserId('user_1')).resolves.toBe(10);
      await expect(repo.countCorrectByUserId('user_1')).resolves.toBe(7);
      await expect(
        repo.countByUserIdSince('user_1', new Date('2026-02-01T00:00:00Z')),
      ).resolves.toBe(3);
      await expect(
        repo.countCorrectByUserIdSince(
          'user_1',
          new Date('2026-02-01T00:00:00Z'),
        ),
      ).resolves.toBe(2);
    });
  });

  describe('listRecentByUserId', () => {
    it('returns recent attempts mapped to domain objects', async () => {
      const db = createDbMock();
      const answeredAt = new Date('2026-02-02T00:00:00Z');
      db._mocks.recentQueryExecute.mockResolvedValue([
        {
          id: 'attempt_1',
          userId: 'user_1',
          questionId: 'question_1',
          practiceSessionId: null,
          selectedChoiceId: 'choice_1',
          isCorrect: true,
          timeSpentSeconds: 12,
          answeredAt,
          sessionMode: null,
        },
      ]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(repo.listRecentByUserId('user_1', 5)).resolves.toEqual([
        {
          id: 'attempt_1',
          userId: 'user_1',
          questionId: 'question_1',
          practiceSessionId: null,
          selectedChoiceId: 'choice_1',
          isCorrect: true,
          timeSpentSeconds: 12,
          retryOfAttemptId: null,
          retryOrigin: null,
          retrySessionId: null,
          answeredAt,
          sessionMode: null,
        },
      ]);
    });

    it('applies active-exam secrecy filter conditions when building the recent-attempt query', async () => {
      const db = createDbMock();
      db._mocks.recentQueryExecute.mockResolvedValue([]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);
      await repo.listRecentByUserId('user_1', 20);

      expect(db._mocks.recentWhere).toHaveBeenCalledTimes(1);
      const whereCalls = db._mocks.recentWhere.mock.calls as unknown[][];
      const whereClause = whereCalls[0]?.[0];
      expect(whereClause).toBeDefined();
      const practiceSessionColumns = collectColumnNamesForTable(
        whereClause,
        practiceSessions,
      );

      expect(practiceSessionColumns).toContain('mode');
      expect(practiceSessionColumns).toContain('ended_at');
    });
  });

  describe('listAnsweredAtByUserIdSince', () => {
    it('returns answeredAt values from the database', async () => {
      const db = createDbMock();
      const answeredAt = new Date('2026-02-02T00:00:00Z');
      db._mocks.queryFindMany.mockResolvedValue([{ answeredAt }]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(
        repo.listAnsweredAtByUserIdSince(
          'user_1',
          new Date('2026-02-01T00:00:00Z'),
        ),
      ).resolves.toEqual([answeredAt]);
    });
  });

  describe('listAttemptedQuestionsByUserId', () => {
    it('returns only rows with answeredAt values', async () => {
      const db = createDbMock();
      const answeredAt = new Date('2026-02-02T00:00:00Z');

      db._mocks.finalQueryExecute.mockResolvedValue([
        {
          questionId: 'q1',
          answeredAt,
          isCorrect: true,
          sessionId: 'session-1',
          sessionMode: 'exam',
        },
        {
          questionId: 'q2',
          answeredAt: null,
          isCorrect: false,
          sessionId: null,
          sessionMode: null,
        },
      ]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(
        repo.listAttemptedQuestionsByUserId('user_1', 10, 0),
      ).resolves.toEqual([
        {
          questionId: 'q1',
          answeredAt,
          isCorrect: true,
          sessionId: 'session-1',
          sessionMode: 'exam',
        },
      ]);
    });

    it('supports result filter (correct)', async () => {
      const db = createDbMock();
      const answeredAt = new Date('2026-02-02T00:00:00Z');

      db._mocks.finalQueryExecute.mockResolvedValue([
        {
          questionId: 'q_correct',
          answeredAt,
          isCorrect: true,
          sessionId: null,
          sessionMode: null,
        },
      ]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(
        repo.listAttemptedQuestionsByUserId('user_1', 10, 0, {
          result: 'correct',
        }),
      ).resolves.toMatchObject([{ questionId: 'q_correct', isCorrect: true }]);
    });

    it('supports result filter (incorrect)', async () => {
      const db = createDbMock();
      const answeredAt = new Date('2026-02-02T00:00:00Z');

      db._mocks.finalQueryExecute.mockResolvedValue([
        {
          questionId: 'q_incorrect',
          answeredAt,
          isCorrect: false,
          sessionId: null,
          sessionMode: null,
        },
      ]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(
        repo.listAttemptedQuestionsByUserId('user_1', 10, 0, {
          result: 'incorrect',
        }),
      ).resolves.toMatchObject([
        { questionId: 'q_incorrect', isCorrect: false },
      ]);
    });

    it('supports source filter (adhoc)', async () => {
      const db = createDbMock();
      const answeredAt = new Date('2026-02-02T00:00:00Z');

      db._mocks.finalQueryExecute.mockResolvedValue([
        {
          questionId: 'q_adhoc',
          answeredAt,
          isCorrect: true,
          sessionId: null,
          sessionMode: null,
        },
      ]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(
        repo.listAttemptedQuestionsByUserId('user_1', 10, 0, {
          source: 'adhoc',
        }),
      ).resolves.toMatchObject([{ questionId: 'q_adhoc', sessionId: null }]);
    });

    it('supports source filter (tutor)', async () => {
      const db = createDbMock();
      const answeredAt = new Date('2026-02-02T00:00:00Z');

      db._mocks.finalQueryExecute.mockResolvedValue([
        {
          questionId: 'q_tutor',
          answeredAt,
          isCorrect: true,
          sessionId: 'session-1',
          sessionMode: 'tutor',
        },
      ]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(
        repo.listAttemptedQuestionsByUserId('user_1', 10, 0, {
          source: 'tutor',
        }),
      ).resolves.toMatchObject([
        { questionId: 'q_tutor', sessionMode: 'tutor' },
      ]);
    });

    it('supports source filter (exam)', async () => {
      const db = createDbMock();
      const answeredAt = new Date('2026-02-02T00:00:00Z');

      db._mocks.finalQueryExecute.mockResolvedValue([
        {
          questionId: 'q_exam',
          answeredAt,
          isCorrect: true,
          sessionId: 'session-2',
          sessionMode: 'exam',
        },
      ]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(
        repo.listAttemptedQuestionsByUserId('user_1', 10, 0, {
          source: 'exam',
        }),
      ).resolves.toMatchObject([{ questionId: 'q_exam', sessionMode: 'exam' }]);
    });
  });

  describe('countAttemptedQuestionsByUserId', () => {
    it('left-joins practiceSessions and questions, returns count values from the database', async () => {
      const db = createDbMock();
      db._mocks.countWhere.mockResolvedValueOnce([{ count: 3 }]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(
        repo.countAttemptedQuestionsByUserId('user_1'),
      ).resolves.toBe(3);
      expect(db._mocks.countLeftJoin).toHaveBeenCalledTimes(2);
    });

    it('returns count when filtered by source=tutor', async () => {
      const db = createDbMock();
      db._mocks.countWhere.mockResolvedValueOnce([{ count: 1 }]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(
        repo.countAttemptedQuestionsByUserId('user_1', { source: 'tutor' }),
      ).resolves.toBe(1);
      expect(db._mocks.countLeftJoin).toHaveBeenCalledTimes(2);
    });

    it('returns count when filtered by source=exam', async () => {
      const db = createDbMock();
      db._mocks.countWhere.mockResolvedValueOnce([{ count: 2 }]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(
        repo.countAttemptedQuestionsByUserId('user_1', { source: 'exam' }),
      ).resolves.toBe(2);
      expect(db._mocks.countLeftJoin).toHaveBeenCalledTimes(2);
    });
  });
});
