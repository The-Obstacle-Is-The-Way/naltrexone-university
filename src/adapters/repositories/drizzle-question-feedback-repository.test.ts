import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import {
  newQuestionRatingFeedback,
  newQuestionReportFeedback,
} from '@/src/domain/entities';
import { DrizzleQuestionFeedbackRepository } from './drizzle-question-feedback-repository';

type RepoDb = ConstructorParameters<
  typeof DrizzleQuestionFeedbackRepository
>[0];

const userId = crypto.randomUUID();
const questionId = crypto.randomUUID();

function createDbMock() {
  const insertReturning = vi.fn();
  const insertValues = vi.fn(() => ({ returning: insertReturning }));
  const insert = vi.fn(() => ({ values: insertValues }));
  const queryFindFirst = vi.fn();

  return {
    insert,
    query: {
      questionFeedback: {
        findFirst: queryFindFirst,
      },
    },
    _mocks: {
      insertReturning,
      insertValues,
      queryFindFirst,
    },
  } as const;
}

describe('DrizzleQuestionFeedbackRepository', () => {
  describe('record', () => {
    it('inserts and maps a rating event', async () => {
      const db = createDbMock();
      const createdAt = new Date('2026-02-10T00:00:00.000Z');
      db._mocks.insertReturning.mockResolvedValue([
        {
          id: 'feedback-1',
          userId,
          questionId,
          attemptId: 'attempt-1',
          practiceSessionId: 'session-1',
          kind: 'rating',
          rating: 'helpful',
          category: null,
          comment: null,
          createdAt,
        },
      ]);
      const repo = new DrizzleQuestionFeedbackRepository(
        db as unknown as RepoDb,
      );

      await expect(
        repo.record(
          newQuestionRatingFeedback({
            userId,
            questionId,
            attemptId: 'attempt-1',
            practiceSessionId: 'session-1',
            rating: 'helpful',
          }),
        ),
      ).resolves.toEqual({
        id: 'feedback-1',
        userId,
        questionId,
        attemptId: 'attempt-1',
        practiceSessionId: 'session-1',
        kind: 'rating',
        rating: 'helpful',
        category: null,
        comment: null,
        createdAt,
      });
      expect(db._mocks.insertValues).toHaveBeenCalledWith({
        userId,
        questionId,
        attemptId: 'attempt-1',
        practiceSessionId: 'session-1',
        kind: 'rating',
        rating: 'helpful',
        category: null,
        comment: null,
      });
    });

    it('inserts and maps a report event', async () => {
      const db = createDbMock();
      const createdAt = new Date('2026-02-10T00:00:00.000Z');
      db._mocks.insertReturning.mockResolvedValue([
        {
          id: 'feedback-1',
          userId,
          questionId,
          attemptId: null,
          practiceSessionId: null,
          kind: 'report',
          rating: null,
          category: 'incorrect_answer',
          comment: 'The keyed answer appears wrong.',
          createdAt,
        },
      ]);
      const repo = new DrizzleQuestionFeedbackRepository(
        db as unknown as RepoDb,
      );

      await expect(
        repo.record(
          newQuestionReportFeedback({
            userId,
            questionId,
            attemptId: null,
            practiceSessionId: null,
            category: 'incorrect_answer',
            comment: 'The keyed answer appears wrong.',
          }),
        ),
      ).resolves.toEqual({
        id: 'feedback-1',
        userId,
        questionId,
        attemptId: null,
        practiceSessionId: null,
        kind: 'report',
        rating: null,
        category: 'incorrect_answer',
        comment: 'The keyed answer appears wrong.',
        createdAt,
      });
    });

    it('throws INTERNAL_ERROR when insert returns no rows', async () => {
      const db = createDbMock();
      db._mocks.insertReturning.mockResolvedValue([]);
      const repo = new DrizzleQuestionFeedbackRepository(
        db as unknown as RepoDb,
      );

      const promise = repo.record(
        newQuestionRatingFeedback({
          userId,
          questionId,
          attemptId: null,
          practiceSessionId: null,
          rating: 'helpful',
        }),
      );

      await expect(promise).rejects.toBeInstanceOf(ApplicationError);
      await expect(promise).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    });
  });

  describe('findLatestRatingByUser', () => {
    it('returns null when no rating exists', async () => {
      const db = createDbMock();
      db._mocks.queryFindFirst.mockResolvedValue(null);
      const repo = new DrizzleQuestionFeedbackRepository(
        db as unknown as RepoDb,
      );

      await expect(
        repo.findLatestRatingByUser(userId, questionId),
      ).resolves.toBeNull();
    });

    it('maps the latest rating row and orders by createdAt then id descending', async () => {
      const db = createDbMock();
      const createdAt = new Date('2026-02-10T00:00:00.000Z');
      db._mocks.queryFindFirst.mockResolvedValue({
        id: 'feedback-1',
        userId,
        questionId,
        attemptId: null,
        practiceSessionId: null,
        kind: 'rating',
        rating: null,
        category: null,
        comment: null,
        createdAt,
      });
      const repo = new DrizzleQuestionFeedbackRepository(
        db as unknown as RepoDb,
      );

      await expect(
        repo.findLatestRatingByUser(userId, questionId),
      ).resolves.toEqual({
        id: 'feedback-1',
        userId,
        questionId,
        attemptId: null,
        practiceSessionId: null,
        kind: 'rating',
        rating: null,
        category: null,
        comment: null,
        createdAt,
      });

      const queryArgs = db._mocks.queryFindFirst.mock.calls[0]?.[0];
      const orderBy = queryArgs?.orderBy;
      expect(orderBy).toHaveLength(2);
      const orderSql = (orderBy as SQL[]).map(
        (clause) => new PgDialect().sqlToQuery(clause).sql,
      );
      expect(orderSql[0]).toMatch(/"question_feedback"\."created_at"\s+desc/i);
      expect(orderSql[1]).toMatch(/"question_feedback"\."id"\s+desc/i);
    });

    it('throws INTERNAL_ERROR when the latest-rating read fails', async () => {
      const db = createDbMock();
      const dbError = new Error('db down');
      db._mocks.queryFindFirst.mockRejectedValue(dbError);
      const repo = new DrizzleQuestionFeedbackRepository(
        db as unknown as RepoDb,
      );

      const promise = repo.findLatestRatingByUser(userId, questionId);

      await expect(promise).rejects.toBeInstanceOf(ApplicationError);
      await expect(promise).rejects.toMatchObject({
        code: 'INTERNAL_ERROR',
        message: 'Failed to load latest question rating',
        cause: dbError,
      });
    });
  });
});
