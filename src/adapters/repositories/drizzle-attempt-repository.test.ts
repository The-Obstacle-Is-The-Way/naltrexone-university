import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import {
  ATTEMPTS_SESSION_QUESTION_UQ,
  attempts,
  practiceSessions,
} from '@/db/schema';
import {
  ApplicationError,
  AttemptConflictMessages,
} from '@/src/application/errors';
import { answeredOutcome, omittedOutcome } from '@/src/domain/value-objects';
import { DrizzleAttemptRepository } from './drizzle-attempt-repository';

type RepoDb = ConstructorParameters<typeof DrizzleAttemptRepository>[0];

const attemptId = crypto.randomUUID();
const userId = crypto.randomUUID();
const questionId = crypto.randomUUID();
const sessionId = crypto.randomUUID();
const alternateSessionId = crypto.randomUUID();
const selectedChoiceId = crypto.randomUUID();
const firstQuestionId = crypto.randomUUID();
const secondQuestionId = crypto.randomUUID();
const correctQuestionId = crypto.randomUUID();
const incorrectQuestionId = crypto.randomUUID();
const adhocQuestionId = crypto.randomUUID();
const tutorQuestionId = crypto.randomUUID();
const examQuestionId = crypto.randomUUID();

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
        isOmitted: boolean;
        isCorrect: boolean;
        timeSpentSeconds: number;
        answeredAt: Date;
        sessionMode: 'tutor' | 'exam' | null;
      }>
    > => [],
  );
  const answeredAtQueryExecute = vi.fn(
    async (): Promise<Array<{ answeredAt: Date }>> => [],
  );
  const findLatestLimit = vi.fn(
    async (): Promise<
      Array<{
        attempts: {
          id: string;
          userId: string;
          questionId: string;
          practiceSessionId: string | null;
          selectedChoiceId: string | null;
          isOmitted: boolean;
          isCorrect: boolean;
          timeSpentSeconds: number;
          retryOfAttemptId?: string | null;
          retryOrigin?: null;
          retrySessionId?: string | null;
          answeredAt: Date;
        };
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
  const leftJoinLatestAttemptRows = vi.fn(() => ({ where: whereGroupBy }));

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
  const answeredAtOrderBy = vi.fn(() => answeredAtQueryExecute());
  const answeredAtWhere = vi.fn(() => ({ orderBy: answeredAtOrderBy }));
  const leftJoinAnsweredAt = vi.fn(() => ({ where: answeredAtWhere }));
  const findLatestOrderBy = vi.fn(() => ({ limit: findLatestLimit }));
  const findLatestWhere = vi.fn(() => ({ orderBy: findLatestOrderBy }));
  const leftJoinFindLatest = vi.fn(() => ({ where: findLatestWhere }));
  const findLatestFrom = vi.fn(() => ({
    leftJoin: leftJoinFindLatest,
    where: findLatestWhere,
  }));
  const leftJoinFindMostRecent = vi.fn(() => ({ where: whereGroupBy }));
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

  const select = vi.fn((fields?: Record<string, unknown>) => {
    if (fields === undefined) {
      return { from: findLatestFrom };
    }

    if ('count' in fields) {
      return {
        from: countFrom,
      };
    }

    if ('attemptRank' in fields) {
      return {
        from: vi.fn(() => ({ leftJoin: leftJoinLatestAttemptRows })),
      };
    }

    if (Object.keys(fields).length === 1 && 'answeredAt' in fields) {
      return {
        from: vi.fn(() => ({ leftJoin: leftJoinAnsweredAt })),
      };
    }

    if (
      Object.keys(fields).length === 2 &&
      'questionId' in fields &&
      'answeredAt' in fields
    ) {
      return {
        from: vi.fn(() => ({
          leftJoin: leftJoinFindMostRecent,
          where: whereGroupBy,
        })),
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
      leftJoinLatestAttemptRows,
      answeredAtQueryExecute,
      innerJoin,
      leftJoinFinal,
      leftJoinRecent,
      leftJoinAnsweredAt,
      findLatestFrom,
      leftJoinFindLatest,
      findLatestWhere,
      findLatestOrderBy,
      findLatestLimit,
      leftJoinFindMostRecent,
      recentWhere,
      recentOrderBy,
      recentLimit,
      answeredAtWhere,
      answeredAtOrderBy,
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
          id: attemptId,
          userId: userId,
          questionId: questionId,
          practiceSessionId: sessionId,
          selectedChoiceId: selectedChoiceId,
          isOmitted: false,
          isCorrect: true,
          timeSpentSeconds: 42,
          answeredAt,
        },
      ]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(
        repo.insert({
          userId: userId,
          questionId: questionId,
          practiceSessionId: sessionId,
          outcome: answeredOutcome(selectedChoiceId),
          isCorrect: true,
          timeSpentSeconds: 42,
        }),
      ).resolves.toEqual({
        id: attemptId,
        userId: userId,
        questionId: questionId,
        practiceSessionId: sessionId,
        outcome: {
          kind: 'answered',
          selectedChoiceId: selectedChoiceId,
        },
        isCorrect: true,
        timeSpentSeconds: 42,
        retryOfAttemptId: null,
        retryOrigin: null,
        retrySessionId: null,
        answeredAt,
      });

      expect(db._mocks.insertValues).toHaveBeenCalledWith({
        userId: userId,
        questionId: questionId,
        practiceSessionId: sessionId,
        selectedChoiceId: selectedChoiceId,
        isOmitted: false,
        isCorrect: true,
        timeSpentSeconds: 42,
        retryOfAttemptId: null,
        retryOrigin: null,
        retrySessionId: null,
      });
    });

    it('passes an explicit answeredAt timestamp when provided', async () => {
      const db = createDbMock();
      const answeredAt = new Date('2026-02-01T00:00:00Z');
      const explicitAnsweredAt = new Date('2026-02-01T00:00:42Z');
      db._mocks.insertReturning.mockResolvedValue([
        {
          id: attemptId,
          userId: userId,
          questionId: questionId,
          practiceSessionId: sessionId,
          selectedChoiceId: selectedChoiceId,
          isOmitted: false,
          isCorrect: true,
          timeSpentSeconds: 42,
          answeredAt,
        },
      ]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await repo.insert({
        userId: userId,
        questionId: questionId,
        practiceSessionId: sessionId,
        outcome: answeredOutcome(selectedChoiceId),
        isCorrect: true,
        timeSpentSeconds: 42,
        answeredAt: explicitAnsweredAt,
      });

      expect(db._mocks.insertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          answeredAt: explicitAnsweredAt,
        }),
      );
    });

    it('returns an inserted omitted attempt', async () => {
      const db = createDbMock();
      const answeredAt = new Date('2026-02-01T00:00:00Z');
      db._mocks.insertReturning.mockResolvedValue([
        {
          id: attemptId,
          userId: userId,
          questionId: questionId,
          practiceSessionId: sessionId,
          selectedChoiceId: null,
          isOmitted: true,
          isCorrect: false,
          timeSpentSeconds: 0,
          answeredAt,
        },
      ]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(
        repo.insert({
          userId: userId,
          questionId: questionId,
          practiceSessionId: sessionId,
          outcome: omittedOutcome(),
          isCorrect: false,
          timeSpentSeconds: 0,
        }),
      ).resolves.toMatchObject({
        outcome: { kind: 'omitted' },
        isCorrect: false,
      });

      expect(db._mocks.insertValues).toHaveBeenCalledWith({
        userId: userId,
        questionId: questionId,
        practiceSessionId: sessionId,
        selectedChoiceId: null,
        isOmitted: true,
        isCorrect: false,
        timeSpentSeconds: 0,
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
        userId: userId,
        questionId: questionId,
        practiceSessionId: null,
        outcome: answeredOutcome(selectedChoiceId),
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
          id: attemptId,
          userId: userId,
          questionId: questionId,
          practiceSessionId: null,
          selectedChoiceId: null,
          isCorrect: false,
          timeSpentSeconds: 5,
          answeredAt: new Date('2026-02-01T00:00:00Z'),
        },
      ]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      const promise = repo.insert({
        userId: userId,
        questionId: questionId,
        practiceSessionId: null,
        outcome: answeredOutcome(selectedChoiceId),
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
        userId: userId,
        questionId: questionId,
        practiceSessionId: sessionId,
        outcome: answeredOutcome(selectedChoiceId),
        isCorrect: true,
        timeSpentSeconds: 12,
      });

      await expect(promise).rejects.toEqual(
        new ApplicationError(
          'CONFLICT',
          AttemptConflictMessages.AlreadyAnsweredInSession,
        ),
      );
    });

    it('wraps unique violations from other constraints in INTERNAL_ERROR with cause', async () => {
      const db = createDbMock();
      const cause = {
        code: '23505',
        constraint: 'some_other_unique_constraint',
      };
      db._mocks.insertReturning.mockRejectedValue(cause);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      const promise = repo.insert({
        userId: userId,
        questionId: questionId,
        practiceSessionId: sessionId,
        outcome: answeredOutcome(selectedChoiceId),
        isCorrect: true,
        timeSpentSeconds: 12,
      });

      await expect(promise).rejects.toMatchObject({
        code: 'INTERNAL_ERROR',
        message: 'Failed to insert attempt',
      });
      const error = await promise.catch((caughtError: unknown) => caughtError);

      expect(error).toBeInstanceOf(ApplicationError);
      expect((error as Error).cause).toBe(cause);
    });

    it('wraps unexpected insert errors in INTERNAL_ERROR with cause', async () => {
      const db = createDbMock();
      const cause = new Error('db unavailable');
      db._mocks.insertReturning.mockRejectedValue(cause);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      const promise = repo.insert({
        userId: userId,
        questionId: questionId,
        practiceSessionId: null,
        outcome: answeredOutcome(selectedChoiceId),
        isCorrect: true,
        timeSpentSeconds: 12,
      });

      await expect(promise).rejects.toMatchObject({
        code: 'INTERNAL_ERROR',
        message: 'Failed to insert attempt',
      });
      const error = await promise.catch((caughtError: unknown) => caughtError);

      expect(error).toBeInstanceOf(ApplicationError);
      expect((error as Error).cause).toBe(cause);
    });
  });

  describe('findByUserId', () => {
    it('returns attempts mapped to domain objects', async () => {
      const db = createDbMock();
      const answeredAt = new Date('2026-02-01T00:00:00Z');
      db._mocks.queryFindMany.mockResolvedValue([
        {
          id: attemptId,
          userId: userId,
          questionId: questionId,
          practiceSessionId: null,
          selectedChoiceId: selectedChoiceId,
          isOmitted: false,
          isCorrect: true,
          timeSpentSeconds: 12,
          answeredAt,
        },
      ]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(
        repo.findByUserId(userId, { limit: 10, offset: 0 }),
      ).resolves.toEqual([
        {
          id: attemptId,
          userId: userId,
          questionId: questionId,
          practiceSessionId: null,
          outcome: {
            kind: 'answered',
            selectedChoiceId: selectedChoiceId,
          },
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
        repo.findByUserId(userId, { limit: 0, offset: 0 }),
      ).resolves.toEqual([]);

      expect(db._mocks.queryFindMany).not.toHaveBeenCalled();
    });

    it('clamps negative offsets to 0', async () => {
      const db = createDbMock();
      db._mocks.queryFindMany.mockResolvedValue([]);
      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await repo.findByUserId(userId, { limit: 10, offset: -5 });

      expect(db._mocks.queryFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10, offset: 0 }),
      );
    });

    it('throws INTERNAL_ERROR when selectedChoiceId is missing', async () => {
      const db = createDbMock();
      db._mocks.queryFindMany.mockResolvedValue([
        {
          id: attemptId,
          selectedChoiceId: null,
          userId: userId,
          questionId: questionId,
          practiceSessionId: null,
          isCorrect: false,
          timeSpentSeconds: 1,
          answeredAt: new Date('2026-02-01T00:00:00Z'),
        },
      ]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      const promise = repo.findByUserId(userId, { limit: 10, offset: 0 });
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
          id: attemptId,
          userId: userId,
          questionId: questionId,
          practiceSessionId: sessionId,
          selectedChoiceId: selectedChoiceId,
          isOmitted: false,
          isCorrect: false,
          timeSpentSeconds: 9,
          answeredAt,
        },
      ]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(repo.findBySessionId(sessionId, userId)).resolves.toEqual([
        {
          id: attemptId,
          userId: userId,
          questionId: questionId,
          practiceSessionId: sessionId,
          outcome: {
            kind: 'answered',
            selectedChoiceId: selectedChoiceId,
          },
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
        repo.findMostRecentAnsweredAtByQuestionIds(userId, []),
      ).resolves.toEqual([]);

      expect(db._mocks.select).not.toHaveBeenCalled();
    });

    it('returns only rows with answeredAt values', async () => {
      const db = createDbMock();
      const answeredAt = new Date('2026-02-01T00:00:00Z');
      db._mocks.groupByExecute.mockResolvedValue([
        { questionId: firstQuestionId, answeredAt },
        { questionId: secondQuestionId, answeredAt: null },
      ]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(
        repo.findMostRecentAnsweredAtByQuestionIds(userId, [
          firstQuestionId,
          secondQuestionId,
        ]),
      ).resolves.toEqual([{ questionId: firstQuestionId, answeredAt }]);
    });

    it('left-joins practice sessions before aggregating latest answeredAt values', async () => {
      const db = createDbMock();
      const answeredAt = new Date('2026-02-01T00:00:00Z');
      db._mocks.groupByExecute.mockResolvedValue([
        { questionId: firstQuestionId, answeredAt },
      ]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(
        repo.findMostRecentAnsweredAtByQuestionIds(userId, [firstQuestionId]),
      ).resolves.toEqual([{ questionId: firstQuestionId, answeredAt }]);

      expect(db._mocks.leftJoinFindMostRecent).toHaveBeenCalledTimes(1);
      expect(db._mocks.leftJoinFindMostRecent).toHaveBeenCalledWith(
        practiceSessions,
        eq(attempts.practiceSessionId, practiceSessions.id),
      );
    });
  });

  describe('findLatestByUserAndQuestion', () => {
    it('left-joins practice sessions before selecting the latest attempt', async () => {
      const db = createDbMock();
      const answeredAt = new Date('2026-02-01T00:00:00Z');
      const attemptRow = {
        id: attemptId,
        userId: userId,
        questionId: questionId,
        practiceSessionId: null,
        selectedChoiceId: selectedChoiceId,
        isOmitted: false,
        isCorrect: true,
        timeSpentSeconds: 42,
        retryOfAttemptId: null,
        retryOrigin: null,
        retrySessionId: null,
        answeredAt,
      };
      db._mocks.findLatestLimit.mockResolvedValue([
        {
          attempts: attemptRow,
        },
      ]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(
        repo.findLatestByUserAndQuestion(userId, questionId),
      ).resolves.toMatchObject({
        id: attemptId,
        userId: userId,
        questionId: questionId,
        answeredAt,
      });

      expect(db._mocks.leftJoinFindLatest).toHaveBeenCalledTimes(1);
      expect(db._mocks.leftJoinFindLatest).toHaveBeenCalledWith(
        practiceSessions,
        eq(attempts.practiceSessionId, practiceSessions.id),
      );
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

      await expect(repo.countByUserId(userId)).resolves.toBe(10);
      await expect(repo.countCorrectByUserId(userId)).resolves.toBe(7);
      await expect(
        repo.countByUserIdSince(userId, new Date('2026-02-01T00:00:00Z')),
      ).resolves.toBe(3);
      await expect(
        repo.countCorrectByUserIdSince(
          userId,
          new Date('2026-02-01T00:00:00Z'),
        ),
      ).resolves.toBe(2);
    });

    it('applies active-exam secrecy filtering to aggregate count queries', async () => {
      const db = createDbMock();
      db._mocks.countWhere.mockResolvedValueOnce([{ count: 10 }]);
      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(repo.countByUserId(userId)).resolves.toBe(10);

      expect(db._mocks.countLeftJoin).toHaveBeenCalledTimes(1);
      expect(db._mocks.countWhere).toHaveBeenCalledTimes(1);
    });
  });

  describe('listRecentByUserId', () => {
    it('returns recent attempts mapped to domain objects', async () => {
      const db = createDbMock();
      const answeredAt = new Date('2026-02-02T00:00:00Z');
      db._mocks.recentQueryExecute.mockResolvedValue([
        {
          id: attemptId,
          userId: userId,
          questionId: questionId,
          practiceSessionId: null,
          selectedChoiceId: selectedChoiceId,
          isOmitted: false,
          isCorrect: true,
          timeSpentSeconds: 12,
          answeredAt,
          sessionMode: null,
        },
      ]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(repo.listRecentByUserId(userId, 5)).resolves.toEqual([
        {
          id: attemptId,
          userId: userId,
          questionId: questionId,
          practiceSessionId: null,
          outcome: {
            kind: 'answered',
            selectedChoiceId: selectedChoiceId,
          },
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

    it('applies active-exam secrecy filtering to recent-attempt query', async () => {
      const db = createDbMock();
      db._mocks.recentQueryExecute.mockResolvedValue([]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);
      await repo.listRecentByUserId(userId, 20);

      expect(db._mocks.recentWhere).toHaveBeenCalledTimes(1);
    });
  });

  describe('listAnsweredAtByUserIdSince', () => {
    it('returns answeredAt values from the database', async () => {
      const db = createDbMock();
      const answeredAt = new Date('2026-02-02T00:00:00Z');
      db._mocks.answeredAtQueryExecute.mockResolvedValue([{ answeredAt }]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(
        repo.listAnsweredAtByUserIdSince(
          userId,
          new Date('2026-02-01T00:00:00Z'),
        ),
      ).resolves.toEqual([answeredAt]);
      expect(db._mocks.leftJoinAnsweredAt).toHaveBeenCalledTimes(1);
      expect(db._mocks.answeredAtWhere).toHaveBeenCalledTimes(1);
    });
  });

  describe('listAttemptedQuestionsByUserId', () => {
    it('returns only rows with answeredAt values', async () => {
      const db = createDbMock();
      const answeredAt = new Date('2026-02-02T00:00:00Z');

      db._mocks.finalQueryExecute.mockResolvedValue([
        {
          questionId: firstQuestionId,
          answeredAt,
          isCorrect: true,
          sessionId: sessionId,
          sessionMode: 'exam',
        },
        {
          questionId: secondQuestionId,
          answeredAt: null,
          isCorrect: false,
          sessionId: null,
          sessionMode: null,
        },
      ]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(
        repo.listAttemptedQuestionsByUserId(userId, 10, 0),
      ).resolves.toEqual([
        {
          questionId: firstQuestionId,
          answeredAt,
          isCorrect: true,
          sessionId: sessionId,
          sessionMode: 'exam',
        },
      ]);
    });

    it('supports result filter (correct)', async () => {
      const db = createDbMock();
      const answeredAt = new Date('2026-02-02T00:00:00Z');

      db._mocks.finalQueryExecute.mockResolvedValue([
        {
          questionId: correctQuestionId,
          answeredAt,
          isCorrect: true,
          sessionId: null,
          sessionMode: null,
        },
      ]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(
        repo.listAttemptedQuestionsByUserId(userId, 10, 0, {
          result: 'correct',
        }),
      ).resolves.toMatchObject([
        { questionId: correctQuestionId, isCorrect: true },
      ]);
    });

    it('supports result filter (incorrect)', async () => {
      const db = createDbMock();
      const answeredAt = new Date('2026-02-02T00:00:00Z');

      db._mocks.finalQueryExecute.mockResolvedValue([
        {
          questionId: incorrectQuestionId,
          answeredAt,
          isCorrect: false,
          sessionId: null,
          sessionMode: null,
        },
      ]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(
        repo.listAttemptedQuestionsByUserId(userId, 10, 0, {
          result: 'incorrect',
        }),
      ).resolves.toMatchObject([
        { questionId: incorrectQuestionId, isCorrect: false },
      ]);
    });

    it('supports source filter (adhoc)', async () => {
      const db = createDbMock();
      const answeredAt = new Date('2026-02-02T00:00:00Z');

      db._mocks.finalQueryExecute.mockResolvedValue([
        {
          questionId: adhocQuestionId,
          answeredAt,
          isCorrect: true,
          sessionId: null,
          sessionMode: null,
        },
      ]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(
        repo.listAttemptedQuestionsByUserId(userId, 10, 0, {
          source: 'adhoc',
        }),
      ).resolves.toMatchObject([
        { questionId: adhocQuestionId, sessionId: null },
      ]);
    });

    it('supports source filter (tutor)', async () => {
      const db = createDbMock();
      const answeredAt = new Date('2026-02-02T00:00:00Z');

      db._mocks.finalQueryExecute.mockResolvedValue([
        {
          questionId: tutorQuestionId,
          answeredAt,
          isCorrect: true,
          sessionId: sessionId,
          sessionMode: 'tutor',
        },
      ]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(
        repo.listAttemptedQuestionsByUserId(userId, 10, 0, {
          source: 'tutor',
        }),
      ).resolves.toMatchObject([
        { questionId: tutorQuestionId, sessionMode: 'tutor' },
      ]);
    });

    it('supports source filter (exam)', async () => {
      const db = createDbMock();
      const answeredAt = new Date('2026-02-02T00:00:00Z');

      db._mocks.finalQueryExecute.mockResolvedValue([
        {
          questionId: examQuestionId,
          answeredAt,
          isCorrect: true,
          sessionId: alternateSessionId,
          sessionMode: 'exam',
        },
      ]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(
        repo.listAttemptedQuestionsByUserId(userId, 10, 0, {
          source: 'exam',
        }),
      ).resolves.toMatchObject([
        { questionId: examQuestionId, sessionMode: 'exam' },
      ]);
    });

    it('applies active-exam secrecy filtering to attempted-question list query', async () => {
      const db = createDbMock();
      db._mocks.finalQueryExecute.mockResolvedValue([]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);
      await repo.listAttemptedQuestionsByUserId(userId, 20, 0);

      expect(db._mocks.leftJoinLatestAttemptRows).toHaveBeenCalledTimes(1);
      expect(db._mocks.whereGroupBy).toHaveBeenCalledTimes(1);
      expect(db._mocks.whereFinal).toHaveBeenCalledTimes(1);
    });
  });

  describe('countAttemptedQuestionsByUserId', () => {
    it('left-joins practiceSessions and questions, returns count values from the database', async () => {
      const db = createDbMock();
      db._mocks.countWhere.mockResolvedValueOnce([{ count: 3 }]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(repo.countAttemptedQuestionsByUserId(userId)).resolves.toBe(
        3,
      );
      expect(db._mocks.countLeftJoin).toHaveBeenCalledTimes(2);
    });

    it('returns count when filtered by source=tutor', async () => {
      const db = createDbMock();
      db._mocks.countWhere.mockResolvedValueOnce([{ count: 1 }]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(
        repo.countAttemptedQuestionsByUserId(userId, { source: 'tutor' }),
      ).resolves.toBe(1);
      expect(db._mocks.countLeftJoin).toHaveBeenCalledTimes(2);
    });

    it('returns count when filtered by source=exam', async () => {
      const db = createDbMock();
      db._mocks.countWhere.mockResolvedValueOnce([{ count: 2 }]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(
        repo.countAttemptedQuestionsByUserId(userId, { source: 'exam' }),
      ).resolves.toBe(2);
      expect(db._mocks.countLeftJoin).toHaveBeenCalledTimes(2);
    });

    it('applies active-exam secrecy filtering to attempted-question count query', async () => {
      const db = createDbMock();
      db._mocks.countWhere.mockResolvedValueOnce([{ count: 3 }]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);
      await expect(repo.countAttemptedQuestionsByUserId(userId)).resolves.toBe(
        3,
      );

      expect(db._mocks.leftJoinLatestAttemptRows).toHaveBeenCalledTimes(1);
      expect(db._mocks.whereGroupBy).toHaveBeenCalledTimes(1);
      expect(db._mocks.countWhere).toHaveBeenCalledTimes(1);
    });
  });
});
