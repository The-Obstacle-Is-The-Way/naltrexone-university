import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { DrizzleAttemptRepository } from './drizzle-attempt-repository';

type RepoDb = ConstructorParameters<typeof DrizzleAttemptRepository>[0];

function createDbMock() {
  const insertReturning = vi.fn();
  const insertValues = vi.fn(() => ({ returning: insertReturning }));
  const insert = vi.fn(() => ({ values: insertValues }));

  const queryFindMany = vi.fn();

  const selectGroupBy = vi.fn();
  const selectWhere = vi.fn(() => ({ groupBy: selectGroupBy }));
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));

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
      selectGroupBy,
      selectWhere,
      selectFrom,
      select,
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
      db._mocks.selectGroupBy.mockResolvedValue([
        { questionId: 'q1', answeredAt },
        { questionId: 'q2', answeredAt: null },
      ]);

      const repo = new DrizzleAttemptRepository(db as unknown as RepoDb);

      await expect(
        repo.findMostRecentAnsweredAtByQuestionIds('user_1', ['q1', 'q2']),
      ).resolves.toEqual([{ questionId: 'q1', answeredAt }]);
    });
  });
});
