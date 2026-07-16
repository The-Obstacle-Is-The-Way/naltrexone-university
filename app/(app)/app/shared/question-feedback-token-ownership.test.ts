import { describe, expect, it, vi } from 'vitest';
import type { RateQuestionOutput } from '@/src/adapters/controllers/question-feedback-controller';
import {
  IdempotentActionNames,
  shouldCacheQuestionRatingError,
} from '@/src/adapters/controllers/shared/idempotency-error-policy';
import { withIdempotency } from '@/src/adapters/shared/with-idempotency';
import {
  FakeAttemptRepository,
  FakeIdempotencyKeyRepository,
  FakeLogger,
  FakePracticeSessionRepository,
  FakeQuestionFeedbackRepository,
  FakeQuestionRepository,
} from '@/src/application/test-helpers/fakes';
import { RateQuestionUseCase } from '@/src/application/use-cases/rate-question';
import { createAttempt, createQuestion } from '@/src/domain/test-helpers';
import type { QuestionFeedbackRating } from '@/src/domain/value-objects';
import { ok } from '@/tests/test-helpers/ok';
import {
  claimRequestKeySlot,
  createRequestKeySlotStore,
} from './idempotency-request-key';
import { rateQuestionForQuestion } from './question-feedback-actions';

const userId = 'user-1';
const questionId = '11111111-1111-4111-8111-111111111111';
const firstAttemptId = '22222222-2222-4222-8222-222222222222';
const secondAttemptId = '33333333-3333-4333-8333-333333333333';
const firstRequestKey = '44444444-4444-4444-8444-444444444444';
const secondRequestKey = '55555555-5555-4555-8555-555555555555';
const firstRetiredKey = '66666666-6666-4666-8666-666666666666';
const secondRetiredKey = '77777777-7777-4777-8777-777777777777';

type RatingRequest = {
  questionId: string;
  attemptId: string | null;
  practiceSessionId: string | null;
  rating: QuestionFeedbackRating | null;
  idempotencyKey: string;
};

function createDeferred<T>() {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve(value: T) {
      if (!resolvePromise) throw new Error('Deferred promise is not ready');
      resolvePromise(value);
    },
  };
}

function createRatingServer() {
  const feedback = new FakeQuestionFeedbackRepository();
  const now = () => new Date('2026-07-15T00:00:00.000Z');
  const idempotencyKeys = new FakeIdempotencyKeyRepository(now);
  const rateQuestion = new RateQuestionUseCase(
    feedback,
    new FakeQuestionRepository([
      createQuestion({ id: questionId, status: 'published' }),
    ]),
    new FakeAttemptRepository([
      createAttempt({
        id: firstAttemptId,
        userId,
        questionId,
        practiceSessionId: null,
      }),
      createAttempt({
        id: secondAttemptId,
        userId,
        questionId,
        practiceSessionId: null,
      }),
    ]),
    new FakePracticeSessionRepository(),
  );
  const executions: string[] = [];

  return {
    executions,
    feedback,
    handle(request: RatingRequest): Promise<RateQuestionOutput> {
      return withIdempotency({
        repo: idempotencyKeys,
        logger: new FakeLogger(),
        userId,
        action: IdempotentActionNames.QuestionRating,
        key: request.idempotencyKey,
        now,
        shouldCacheError: shouldCacheQuestionRatingError,
        execute: async () => {
          executions.push(request.idempotencyKey);
          return rateQuestion.execute({ userId, ...request });
        },
      });
    },
  };
}

describe('question feedback token ownership', () => {
  it('preserves the newer possibly-committed key after a stale completion and replays it once', async () => {
    const server = createRatingServer();
    const slots = createRequestKeySlotStore();
    const releaseFirstResponse = createDeferred<void>();
    const generatedKeys = [
      firstRequestKey,
      secondRequestKey,
      firstRetiredKey,
      secondRetiredKey,
    ];
    const createIdempotencyKey = vi.fn(() => {
      const key = generatedKeys.shift();
      if (!key) throw new Error('No generated request key remains');
      return key;
    });
    const clientRequestKeys: string[] = [];

    const firstOwner = claimRequestKeySlot(slots, questionId);
    const firstRequest = rateQuestionForQuestion({
      question: {
        questionId,
        attemptId: firstAttemptId,
        practiceSessionId: null,
      },
      currentRating: null,
      nextRating: 'helpful',
      ratingRequestToken: firstOwner.token,
      createIdempotencyKey,
      setRatingRequestToken: firstOwner.setToken,
      rateQuestionFn: async (input) => {
        const request = input as RatingRequest;
        clientRequestKeys.push(request.idempotencyKey);
        await releaseFirstResponse.promise;
        return ok(await server.handle(request));
      },
      setRating: vi.fn(),
      setFeedbackStatus: vi.fn(),
    });

    const secondOwner = claimRequestKeySlot(slots, questionId);
    await rateQuestionForQuestion({
      question: {
        questionId,
        attemptId: secondAttemptId,
        practiceSessionId: null,
      },
      currentRating: null,
      nextRating: 'not_helpful',
      ratingRequestToken: secondOwner.token,
      createIdempotencyKey,
      setRatingRequestToken: secondOwner.setToken,
      rateQuestionFn: async (input) => {
        const request = input as RatingRequest;
        clientRequestKeys.push(request.idempotencyKey);
        await server.handle(request);
        throw new Error('response lost after commit');
      },
      setRating: vi.fn(),
      setFeedbackStatus: vi.fn(),
    });

    releaseFirstResponse.resolve();
    await firstRequest;

    const retryOwner = claimRequestKeySlot(slots, questionId);
    await rateQuestionForQuestion({
      question: {
        questionId,
        attemptId: secondAttemptId,
        practiceSessionId: null,
      },
      currentRating: null,
      nextRating: 'not_helpful',
      ratingRequestToken: retryOwner.token,
      createIdempotencyKey,
      setRatingRequestToken: retryOwner.setToken,
      rateQuestionFn: async (input) => {
        const request = input as RatingRequest;
        clientRequestKeys.push(request.idempotencyKey);
        return ok(await server.handle(request));
      },
      setRating: vi.fn(),
      setFeedbackStatus: vi.fn(),
    });

    expect(clientRequestKeys).toEqual([
      firstRequestKey,
      secondRequestKey,
      secondRequestKey,
    ]);
    expect(server.executions).toEqual([secondRequestKey, firstRequestKey]);
    expect(server.feedback.getAll()).toHaveLength(2);
  });
});
