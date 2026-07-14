import { describe, expect, it } from 'vitest';
import { ApplicationConflictReasons } from '@/src/application/errors';
import { newQuestionRatingFeedback } from '@/src/domain/entities';
import {
  createQuestionRatingFeedback,
  createQuestionReportFeedback,
} from '@/src/domain/test-helpers';
import { FakeQuestionFeedbackRepository } from './fake-question-feedback-repository';

describe('FakeQuestionFeedbackRepository', () => {
  describe('record', () => {
    it('appends a persisted rating event', async () => {
      const createdAt = new Date('2026-02-10T00:00:00.000Z');
      const repo = new FakeQuestionFeedbackRepository([], () => createdAt);

      const result = await repo.record(
        newQuestionRatingFeedback({
          userId: 'user-1',
          questionId: 'question-1',
          attemptId: 'attempt-1',
          practiceSessionId: 'session-1',
          rating: 'helpful',
        }),
      );

      expect(result).toEqual({
        id: expect.any(String),
        userId: 'user-1',
        questionId: 'question-1',
        attemptId: 'attempt-1',
        practiceSessionId: 'session-1',
        kind: 'rating',
        rating: 'helpful',
        category: null,
        comment: null,
        createdAt,
      });
    });

    it('uses the injected id generator for persisted events', async () => {
      const createdAt = new Date('2026-02-10T00:00:00.000Z');
      const ids = ['feedback-1', 'feedback-2'];
      const repo = new FakeQuestionFeedbackRepository(
        [],
        () => createdAt,
        () => ids.shift() ?? 'feedback-fallback',
      );

      const first = await repo.record(
        newQuestionRatingFeedback({
          userId: 'user-1',
          questionId: 'question-1',
          attemptId: null,
          practiceSessionId: null,
          rating: 'helpful',
        }),
      );
      const second = await repo.record(
        newQuestionRatingFeedback({
          userId: 'user-1',
          questionId: 'question-1',
          attemptId: null,
          practiceSessionId: null,
          rating: 'not_helpful',
        }),
      );

      expect(first.id).toBe('feedback-1');
      expect(second.id).toBe('feedback-2');
    });

    it('appends a new event for each call', async () => {
      const times = [
        new Date('2026-02-10T00:00:00.000Z'),
        new Date('2026-02-11T00:00:00.000Z'),
      ];
      const repo = new FakeQuestionFeedbackRepository(
        [],
        () => times.shift() ?? new Date('2026-02-11T00:00:00.000Z'),
      );

      const first = await repo.record(
        newQuestionRatingFeedback({
          userId: 'user-1',
          questionId: 'question-1',
          attemptId: null,
          practiceSessionId: null,
          rating: 'helpful',
        }),
      );
      const second = await repo.record(
        newQuestionRatingFeedback({
          userId: 'user-1',
          questionId: 'question-1',
          attemptId: null,
          practiceSessionId: null,
          rating: 'not_helpful',
        }),
      );

      expect(second.id).not.toBe(first.id);
      await expect(
        repo.findLatestRatingByUser('user-1', 'question-1'),
      ).resolves.toMatchObject({
        id: second.id,
        rating: 'not_helpful',
      });
    });

    it('returns the original event when a request idempotency key is reused', async () => {
      const ids = ['feedback-1', 'feedback-2'];
      const repo = new FakeQuestionFeedbackRepository(
        [],
        () => new Date('2026-02-10T00:00:00.000Z'),
        () => ids.shift() ?? 'feedback-fallback',
      );
      const firstEvent = newQuestionRatingFeedback({
        userId: 'user-1',
        questionId: 'question-1',
        attemptId: null,
        practiceSessionId: null,
        rating: 'helpful',
      });
      const first = await repo.record(firstEvent, {
        idempotencyKey: 'request-1',
      });
      const replay = await repo.record(firstEvent, {
        idempotencyKey: 'request-1',
      });

      expect(replay).toEqual(first);
      await expect(
        repo.findLatestRatingByUser('user-1', 'question-1'),
      ).resolves.toMatchObject({ id: 'feedback-1', rating: 'helpful' });
    });

    it('rejects a reused request idempotency key carrying a different payload', async () => {
      const repo = new FakeQuestionFeedbackRepository(
        [],
        () => new Date('2026-02-10T00:00:00.000Z'),
      );
      const firstEvent = newQuestionRatingFeedback({
        userId: 'user-1',
        questionId: 'question-1',
        attemptId: null,
        practiceSessionId: null,
        rating: 'helpful',
      });
      const changedReplay = newQuestionRatingFeedback({
        ...firstEvent,
        rating: 'not_helpful',
      });

      await repo.record(firstEvent, { idempotencyKey: 'request-1' });

      // A changed intent under the old token must surface, not silently
      // replay the original vote.
      await expect(
        repo.record(changedReplay, { idempotencyKey: 'request-1' }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        details: {
          reason: ApplicationConflictReasons.FeedbackRequestReused,
        },
      });
    });

    it('rejects a reused request idempotency key carrying a different attempt context', async () => {
      const repo = new FakeQuestionFeedbackRepository();
      const firstEvent = newQuestionRatingFeedback({
        userId: 'user-1',
        questionId: 'question-1',
        attemptId: 'attempt-1',
        practiceSessionId: 'session-1',
        rating: 'helpful',
      });

      await repo.record(firstEvent, { idempotencyKey: 'request-1' });

      await expect(
        repo.record(
          newQuestionRatingFeedback({
            ...firstEvent,
            attemptId: 'attempt-2',
          }),
          { idempotencyKey: 'request-1' },
        ),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        details: {
          reason: ApplicationConflictReasons.FeedbackRequestReused,
        },
      });
    });

    it('rejects a reused request idempotency key carrying a different practice-session context', async () => {
      const repo = new FakeQuestionFeedbackRepository();
      const firstEvent = newQuestionRatingFeedback({
        userId: 'user-1',
        questionId: 'question-1',
        attemptId: 'attempt-1',
        practiceSessionId: 'session-1',
        rating: 'helpful',
      });

      await repo.record(firstEvent, { idempotencyKey: 'request-1' });

      await expect(
        repo.record(
          newQuestionRatingFeedback({
            ...firstEvent,
            practiceSessionId: 'session-2',
          }),
          { idempotencyKey: 'request-1' },
        ),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        details: {
          reason: ApplicationConflictReasons.FeedbackRequestReused,
        },
      });
    });
  });

  describe('findLatestRatingByUser', () => {
    it('returns null when no rating exists', async () => {
      const repo = new FakeQuestionFeedbackRepository();

      const result = await repo.findLatestRatingByUser('user-1', 'question-1');

      expect(result).toBeNull();
    });

    it('ignores report events', async () => {
      const repo = new FakeQuestionFeedbackRepository([
        createQuestionReportFeedback({
          userId: 'user-1',
          questionId: 'question-1',
          createdAt: new Date('2026-02-10T00:00:00.000Z'),
        }),
      ]);

      const result = await repo.findLatestRatingByUser('user-1', 'question-1');

      expect(result).toBeNull();
    });

    it('filters by user and question', async () => {
      const repo = new FakeQuestionFeedbackRepository([
        createQuestionRatingFeedback({
          id: 'feedback-1',
          userId: 'user-1',
          questionId: 'question-2',
          rating: 'helpful',
        }),
        createQuestionRatingFeedback({
          id: 'feedback-2',
          userId: 'user-2',
          questionId: 'question-1',
          rating: 'not_helpful',
        }),
        createQuestionRatingFeedback({
          id: 'feedback-3',
          userId: 'user-1',
          questionId: 'question-1',
          rating: null,
        }),
      ]);

      const result = await repo.findLatestRatingByUser('user-1', 'question-1');

      expect(result).toMatchObject({
        id: 'feedback-3',
        rating: null,
      });
    });

    it('returns the newest rating by createdAt descending', async () => {
      const repo = new FakeQuestionFeedbackRepository([
        createQuestionRatingFeedback({
          id: 'feedback-old',
          userId: 'user-1',
          questionId: 'question-1',
          rating: 'helpful',
          createdAt: new Date('2026-02-10T00:00:00.000Z'),
        }),
        createQuestionRatingFeedback({
          id: 'feedback-new',
          userId: 'user-1',
          questionId: 'question-1',
          rating: 'not_helpful',
          createdAt: new Date('2026-02-11T00:00:00.000Z'),
        }),
      ]);

      const result = await repo.findLatestRatingByUser('user-1', 'question-1');

      expect(result).toMatchObject({
        id: 'feedback-new',
        rating: 'not_helpful',
      });
    });

    it('uses id descending as the deterministic tie-breaker', async () => {
      const createdAt = new Date('2026-02-10T00:00:00.000Z');
      const repo = new FakeQuestionFeedbackRepository([
        createQuestionRatingFeedback({
          id: '00000000-0000-4000-8000-000000000001',
          userId: 'user-1',
          questionId: 'question-1',
          rating: 'helpful',
          createdAt,
        }),
        createQuestionRatingFeedback({
          id: '00000000-0000-4000-8000-000000000002',
          userId: 'user-1',
          questionId: 'question-1',
          rating: 'not_helpful',
          createdAt,
        }),
      ]);

      const result = await repo.findLatestRatingByUser('user-1', 'question-1');

      expect(result).toMatchObject({
        id: '00000000-0000-4000-8000-000000000002',
        rating: 'not_helpful',
      });
    });
  });
});
