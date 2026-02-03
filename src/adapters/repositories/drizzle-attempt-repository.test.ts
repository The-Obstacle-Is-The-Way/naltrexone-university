import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { DrizzleAttemptRepository } from './drizzle-attempt-repository';

type RepoDb = ConstructorParameters<typeof DrizzleAttemptRepository>[0];

function createDbMock() {
  const insertReturning = vi.fn();
  const insertValues = vi.fn(() => ({ returning: insertReturning }));
  const insert = vi.fn(() => ({ values: insertValues }));

  const queryFindMany = vi.fn();

  const countWhere = vi.fn(async (): Promise<Array<{ count: number }>> => []);
  const groupByExecute = vi.fn(
    async (): Promise<
      Array<{ questionId: string; answeredAt: Date | null }>
    > => [],
  );
  const finalQueryExecute = vi.fn(
    async (): Promise<
      Array<{ questionId: string; answeredAt: Date | null }>
    > => [],
  );

  const groupByAs = vi.fn((alias: string) => ({
    __alias: alias,
    __isLatestAttemptByQuestion: true,
    questionId: Symbol.for(`${alias}.questionId`),
    answeredAt: Symbol.for(`${alias}.answeredAt`),
  }));

  const groupBy = vi.fn(() => {
    const promise = groupByExecute();
    return Object.assign(promise, {
      as: groupByAs,
    });
  });

  const whereGroupBy = vi.fn(() => ({ groupBy }));

  const offset = vi.fn(() => finalQueryExecute());
  const limit = vi.fn(() => ({ offset }));
  const orderBy = vi.fn(() => ({ limit }));
  const whereFinal = vi.fn(() => ({ orderBy }));
  const innerJoin = vi.fn(() => ({ where: whereFinal }));

  const from = vi.fn((table: unknown) => {
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
      where: whereGroupBy,
    };
  });

  const select = vi.fn((fields: Record<string, unknown>) => {
    if ('count' in fields) {
      return {
        from: () => ({
          where: countWhere,
        }),
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
      whereGroupBy,
      groupBy,
      groupByAs,
      groupByExecute,
      innerJoin,
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
        answeredAt,
      });

      expect(db._mocks.insertValues).toHaveBeenCalledWith({
        userId: 'user_1',
        questionId: 'question_1',
        practiceSessionId: 'session_1',
        selectedChoiceId: 'choice_1',
        isCorrect: true,
        timeSpentSeconds: 42,
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

      await expect(repo.findByUserId('user_1')).resolves.toEqual([
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

      expect(db._mocks.queryFindMany).toHaveBeenCalledTimes(1);
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

      const promise = repo.findByUserId('user_1');
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
          answeredAt,
        },
      ]);
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

      await expect(repo.listRecentByUserId('user_1', 5)).resolves.toEqual([
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

  describe('listMissedQuestionsByUserId', () => {
    it('returns only rows with answeredAt values', async () => {
      const db = createDbMock();
      const answeredAt = new Date('2026-02-02T00:00:00Z');

      db._mocks.finalQueryExecute.mockResolvedValue([
        { questionId: 'q1', answeredAt },
        { questionId: 'q2', answeredAt: null },
      ]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(
        repo.listMissedQuestionsByUserId('user_1', 10, 0),
      ).resolves.toEqual([{ questionId: 'q1', answeredAt }]);
    });
  });
});
