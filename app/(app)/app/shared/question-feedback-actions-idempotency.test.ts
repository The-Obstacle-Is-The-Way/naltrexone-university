import { describe, expect, it, vi } from 'vitest';
import type {
  RateQuestionOutput,
  SubmitQuestionReportOutput,
} from '@/src/adapters/controllers/question-feedback-controller';
import {
  IdempotentActionNames,
  shouldCacheQuestionRatingError,
  shouldCacheQuestionReportError,
} from '@/src/adapters/controllers/shared/idempotency-error-policy';
import { withIdempotency } from '@/src/adapters/shared/with-idempotency';
import {
  FakeIdempotencyKeyRepository,
  FakeLogger,
} from '@/src/application/test-helpers/fakes';
import type { QuestionFeedbackRating } from '@/src/domain/value-objects';
import { ok } from '@/tests/test-helpers/ok';
import {
  type FeedbackRequestToken,
  rateQuestionForQuestion,
  submitReportForQuestion,
} from './question-feedback-actions';

const questionId = '11111111-1111-4111-8111-111111111111';

describe('question-feedback-actions', () => {
  // These regressions span the real wrapper boundary: withIdempotency replays
  // a completed cached outcome BEFORE execute() runs, so any request-identity
  // guard inside execute() cannot protect this path. The client's preserved
  // key must therefore never travel with a different request than the one it
  // was minted for.
  describe('request identity across the idempotency wrapper', () => {
    function createRatingServer() {
      const repo = new FakeIdempotencyKeyRepository();
      const logger = new FakeLogger();
      const executions: Array<{
        rating: QuestionFeedbackRating | null;
        key: string;
      }> = [];

      return {
        executions,
        handle: (req: {
          rating: QuestionFeedbackRating | null;
          idempotencyKey: string;
        }): Promise<RateQuestionOutput> =>
          withIdempotency<RateQuestionOutput>({
            repo,
            logger,
            userId: 'user-1',
            action: IdempotentActionNames.QuestionRating,
            key: req.idempotencyKey,
            now: () => new Date(),
            shouldCacheError: shouldCacheQuestionRatingError,
            execute: async () => {
              executions.push({
                rating: req.rating,
                key: req.idempotencyKey,
              });
              return { rating: req.rating };
            },
          }),
      };
    }

    function createReportServer() {
      const repo = new FakeIdempotencyKeyRepository();
      const logger = new FakeLogger();
      const executions: Array<{ comment: string | null; key: string }> = [];

      return {
        executions,
        handle: (req: {
          comment: string | null;
          idempotencyKey: string;
        }): Promise<SubmitQuestionReportOutput> =>
          withIdempotency<SubmitQuestionReportOutput>({
            repo,
            logger,
            userId: 'user-1',
            action: IdempotentActionNames.QuestionReport,
            key: req.idempotencyKey,
            now: () => new Date(),
            shouldCacheError: shouldCacheQuestionReportError,
            execute: async () => {
              executions.push({
                comment: req.comment,
                key: req.idempotencyKey,
              });
              return { feedbackId: crypto.randomUUID() };
            },
          }),
      };
    }

    type RatingRequest = {
      rating: QuestionFeedbackRating | null;
      idempotencyKey: string;
    };
    type ReportRequest = { comment: string | null; idempotencyKey: string };

    it('replays the committed outcome of a lost response for a same-intent retry without re-executing', async () => {
      const server = createRatingServer();
      let storedToken: FeedbackRequestToken | null = null;
      const ratings: Array<QuestionFeedbackRating | null> = [];
      const statuses: string[] = [];

      // First attempt: the server commits and caches success, but the
      // response is lost to the client (outcome-indeterminate).
      await rateQuestionForQuestion({
        question: { questionId, attemptId: null, practiceSessionId: null },
        currentRating: null,
        nextRating: 'helpful',
        ratingRequestToken: storedToken,
        createIdempotencyKey: () => crypto.randomUUID(),
        setRatingRequestToken: (token) => {
          storedToken = token;
        },
        rateQuestionFn: async (input) => {
          await server.handle(input as RatingRequest);
          throw new Error('response lost');
        },
        setRating: vi.fn(),
        setFeedbackStatus: vi.fn(),
      });

      // Same-intent retry: the preserved key is the handle to the committed
      // outcome and must replay it without a second execution.
      await rateQuestionForQuestion({
        question: { questionId, attemptId: null, practiceSessionId: null },
        currentRating: null,
        nextRating: 'helpful',
        ratingRequestToken: storedToken,
        createIdempotencyKey: () => crypto.randomUUID(),
        setRatingRequestToken: (token) => {
          storedToken = token;
        },
        rateQuestionFn: async (input) =>
          ok(await server.handle(input as RatingRequest)),
        setRating: (rating) => ratings.push(rating),
        setFeedbackStatus: (status) => statuses.push(status),
      });

      expect(server.executions).toHaveLength(1);
      expect(ratings.at(-1)).toBe('helpful');
      expect(statuses.at(-1)).toBe('saved');
    });

    it('re-executes a changed vote instead of replaying the committed outcome of a lost response', async () => {
      const server = createRatingServer();
      let storedToken: FeedbackRequestToken | null = null;
      const ratings: Array<QuestionFeedbackRating | null> = [];
      const statuses: string[] = [];

      await rateQuestionForQuestion({
        question: { questionId, attemptId: null, practiceSessionId: null },
        currentRating: null,
        nextRating: 'helpful',
        ratingRequestToken: storedToken,
        createIdempotencyKey: () => crypto.randomUUID(),
        setRatingRequestToken: (token) => {
          storedToken = token;
        },
        rateQuestionFn: async (input) => {
          await server.handle(input as RatingRequest);
          throw new Error('response lost');
        },
        setRating: vi.fn(),
        setFeedbackStatus: vi.fn(),
      });

      // The changed vote is a NEW request: it must execute under a fresh key,
      // not silently receive the cached 'helpful' as a saved success.
      await rateQuestionForQuestion({
        question: { questionId, attemptId: null, practiceSessionId: null },
        currentRating: null,
        nextRating: 'not_helpful',
        ratingRequestToken: storedToken,
        createIdempotencyKey: () => crypto.randomUUID(),
        setRatingRequestToken: (token) => {
          storedToken = token;
        },
        rateQuestionFn: async (input) =>
          ok(await server.handle(input as RatingRequest)),
        setRating: (rating) => ratings.push(rating),
        setFeedbackStatus: (status) => statuses.push(status),
      });

      expect(server.executions).toHaveLength(2);
      expect(server.executions[1]?.rating).toBe('not_helpful');
      expect(server.executions[0]?.key).not.toBe(server.executions[1]?.key);
      expect(ratings.at(-1)).toBe('not_helpful');
      expect(statuses.at(-1)).toBe('saved');
    });

    it('re-executes an edited report instead of replaying the committed outcome of a lost response', async () => {
      const server = createReportServer();
      let storedToken: FeedbackRequestToken | null = null;

      await submitReportForQuestion({
        question: { questionId, attemptId: null, practiceSessionId: null },
        category: 'other',
        comment: 'First',
        reportRequestToken: storedToken,
        createIdempotencyKey: () => crypto.randomUUID(),
        setReportRequestToken: (token) => {
          storedToken = token;
        },
        submitQuestionReportFn: async (input) => {
          await server.handle(input as ReportRequest);
          throw new Error('response lost');
        },
      });

      const didSubmit = await submitReportForQuestion({
        question: { questionId, attemptId: null, practiceSessionId: null },
        category: 'other',
        comment: 'Changed',
        reportRequestToken: storedToken,
        createIdempotencyKey: () => crypto.randomUUID(),
        setReportRequestToken: (token) => {
          storedToken = token;
        },
        submitQuestionReportFn: async (input) =>
          ok(await server.handle(input as ReportRequest)),
      });

      expect(didSubmit).toBe(true);
      expect(server.executions).toHaveLength(2);
      expect(server.executions[1]?.comment).toBe('Changed');
      expect(server.executions[0]?.key).not.toBe(server.executions[1]?.key);
    });
  });
});
