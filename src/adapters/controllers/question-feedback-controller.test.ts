import { describe, expect, it } from 'vitest';
import { MAX_QUESTION_FEEDBACK_COMMENT_LENGTH } from '@/src/adapters/shared/validation-limits';
import { ApplicationError } from '@/src/application/errors';
import {
  FakeAuthGateway,
  FakeGetQuestionRatingUseCase,
  FakeIdempotencyKeyRepository,
  FakeLogger,
  FakeRateLimiter,
  FakeRateQuestionUseCase,
  FakeSubmitQuestionReportUseCase,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import type {
  GetQuestionRatingOutput,
  RateQuestionOutput,
  SubmitQuestionReportOutput,
} from '@/src/application/use-cases';
import { CheckEntitlementUseCase } from '@/src/application/use-cases/check-entitlement';
import type { User } from '@/src/domain/entities';
import { createSubscription, createUser } from '@/src/domain/test-helpers';
import {
  getQuestionRating,
  type QuestionFeedbackControllerDeps,
  rateQuestion,
  submitQuestionReport,
} from './question-feedback-controller';

const questionId = '11111111-1111-1111-1111-111111111111';
const attemptId = '22222222-2222-2222-2222-222222222222';
const practiceSessionId = '33333333-3333-3333-3333-333333333333';
const idempotencyKey = '44444444-4444-4444-4444-444444444444';
const feedbackId = '55555555-5555-5555-5555-555555555555';

type QuestionFeedbackControllerTestDeps = QuestionFeedbackControllerDeps & {
  rateQuestionUseCase: FakeRateQuestionUseCase;
  getQuestionRatingUseCase: FakeGetQuestionRatingUseCase;
  submitQuestionReportUseCase: FakeSubmitQuestionReportUseCase;
  rateLimiter: FakeRateLimiter;
  _fixtures: {
    userId: string;
  };
};

class StoreResultFailingIdempotencyKeyRepository extends FakeIdempotencyKeyRepository {
  override async storeResult(): Promise<void> {
    throw new Error('store result failed');
  }
}

class StaleClaimIdempotencyKeyRepository extends FakeIdempotencyKeyRepository {
  override async storeResult(): Promise<void> {
    throw new ApplicationError(
      'NOT_FOUND',
      'Idempotency claim is no longer current',
    );
  }
}

function createDeps(overrides?: {
  user?: User | null;
  isEntitled?: boolean;
  rateLimitResult?: ConstructorParameters<typeof FakeRateLimiter>[0];
  rateQuestionOutput?: RateQuestionOutput;
  rateQuestionThrows?: unknown;
  getQuestionRatingOutput?: GetQuestionRatingOutput;
  getQuestionRatingThrows?: unknown;
  submitQuestionReportOutput?: SubmitQuestionReportOutput;
  submitQuestionReportThrows?: unknown;
}): QuestionFeedbackControllerTestDeps {
  const user =
    overrides?.user === undefined
      ? createUser({
          email: 'user@example.com',
          createdAt: new Date('2026-02-01T00:00:00Z'),
          updatedAt: new Date('2026-02-01T00:00:00Z'),
        })
      : overrides.user;
  const userId = user?.id ?? crypto.randomUUID();
  const now = new Date('2026-02-01T00:00:00Z');

  const subscriptionRepository = new FakeSubscriptionRepository(
    overrides?.isEntitled === false
      ? []
      : [
          createSubscription({
            userId,
            status: 'active',
            currentPeriodEnd: new Date('2026-12-31T00:00:00Z'),
          }),
        ],
  );

  const rateQuestionUseCase = new FakeRateQuestionUseCase(
    overrides?.rateQuestionOutput ?? { rating: 'helpful' },
    overrides?.rateQuestionThrows,
  );
  const getQuestionRatingUseCase = new FakeGetQuestionRatingUseCase(
    overrides?.getQuestionRatingOutput ?? { rating: null },
    overrides?.getQuestionRatingThrows,
  );
  const submitQuestionReportUseCase = new FakeSubmitQuestionReportUseCase(
    overrides?.submitQuestionReportOutput ?? { feedbackId },
    overrides?.submitQuestionReportThrows,
  );

  return {
    authGateway: new FakeAuthGateway(user),
    logger: new FakeLogger(),
    rateLimiter: new FakeRateLimiter(overrides?.rateLimitResult),
    idempotencyKeyRepository: new FakeIdempotencyKeyRepository(() => now),
    checkEntitlementUseCase: new CheckEntitlementUseCase(
      subscriptionRepository,
      () => now,
    ),
    rateQuestionUseCase,
    getQuestionRatingUseCase,
    submitQuestionReportUseCase,
    now: () => now,
    _fixtures: {
      userId,
    },
  };
}

describe('question-feedback-controller', () => {
  describe('rateQuestion', () => {
    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createDeps();

      const result = await rateQuestion({ questionId: 'not-a-uuid' }, deps);

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          fieldErrors: { questionId: expect.any(Array) },
        },
      });
      expect(deps.rateQuestionUseCase.inputs).toEqual([]);
    });

    it('returns UNAUTHENTICATED when unauthenticated', async () => {
      const deps = createDeps({ user: null });

      const result = await rateQuestion(
        { questionId, rating: 'helpful' },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
      expect(deps.rateQuestionUseCase.inputs).toEqual([]);
    });

    it('returns UNSUBSCRIBED when not entitled', async () => {
      const deps = createDeps({ isEntitled: false });

      const result = await rateQuestion(
        { questionId, rating: 'helpful' },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
      expect(deps.rateQuestionUseCase.inputs).toEqual([]);
    });

    it('returns ok and normalizes nullish context ids', async () => {
      const deps = createDeps({
        rateQuestionOutput: { rating: 'not_helpful' },
      });

      const result = await rateQuestion(
        { questionId, rating: 'not_helpful' },
        deps,
      );

      expect(result).toEqual({ ok: true, data: { rating: 'not_helpful' } });
      expect(deps.rateQuestionUseCase.inputs).toEqual([
        {
          userId: deps._fixtures.userId,
          questionId,
          attemptId: null,
          practiceSessionId: null,
          rating: 'not_helpful',
        },
      ]);
      expect(deps.rateLimiter.inputs).toEqual([
        {
          key: `question-feedback:rateQuestion:${deps._fixtures.userId}`,
          limit: 60,
          windowMs: 60_000,
        },
      ]);
    });

    it('keeps successful ratings idempotent when idempotencyKey is reused', async () => {
      const deps = createDeps({ rateQuestionOutput: { rating: null } });
      const input = { questionId, rating: null, idempotencyKey } as const;

      const first = await rateQuestion(input, deps);
      const second = await rateQuestion(input, deps);

      expect(first).toEqual({ ok: true, data: { rating: null } });
      expect(second).toEqual(first);
      expect(deps.rateQuestionUseCase.inputs).toHaveLength(1);
      expect(deps.rateQuestionUseCase.inputs[0]).toMatchObject({
        idempotencyKey,
      });
      expect(deps.rateLimiter.inputs).toHaveLength(1);
    });

    it('returns the committed rating when its idempotency claim was concurrently reclaimed', async () => {
      const deps = createDeps({ rateQuestionOutput: { rating: 'helpful' } });
      deps.idempotencyKeyRepository = new StaleClaimIdempotencyKeyRepository(
        deps.now,
      );

      const result = await rateQuestion(
        { questionId, rating: 'helpful', idempotencyKey },
        deps,
      );

      expect(result).toEqual({ ok: true, data: { rating: 'helpful' } });
      expect(deps.rateQuestionUseCase.inputs).toHaveLength(1);
    });

    it('replays a cached rating while the reused key is rate limited', async () => {
      const deps = createDeps({
        rateQuestionOutput: { rating: 'helpful' },
        rateLimitResult: [
          {
            success: true,
            limit: 60,
            remaining: 59,
            retryAfterSeconds: 0,
          },
          {
            success: false,
            limit: 60,
            remaining: 0,
            retryAfterSeconds: 60,
          },
        ],
      });
      const input = { questionId, rating: 'helpful', idempotencyKey } as const;

      const first = await rateQuestion(input, deps);
      const second = await rateQuestion(input, deps);

      expect(first).toEqual({ ok: true, data: { rating: 'helpful' } });
      expect(second).toEqual(first);
      expect(deps.rateQuestionUseCase.inputs).toHaveLength(1);
      expect(deps.rateLimiter.inputs).toHaveLength(1);
    });

    it('does not cache RATE_LIMITED under the idempotency key', async () => {
      const deps = createDeps({
        rateLimitResult: [
          {
            success: false,
            limit: 60,
            remaining: 0,
            retryAfterSeconds: 60,
          },
          {
            success: true,
            limit: 60,
            remaining: 59,
            retryAfterSeconds: 0,
          },
        ],
      });
      const input = { questionId, rating: 'helpful', idempotencyKey } as const;

      const first = await rateQuestion(input, deps);
      expect(first).toMatchObject({
        ok: false,
        error: { code: 'RATE_LIMITED' },
      });

      const second = await rateQuestion(input, deps);
      expect(second).toEqual({ ok: true, data: { rating: 'helpful' } });
      expect(deps.rateQuestionUseCase.inputs).toHaveLength(1);
    });

    it('returns RATE_LIMITED when rating limit denies request', async () => {
      const deps = createDeps({
        rateLimitResult: {
          success: false,
          limit: 60,
          remaining: 0,
          retryAfterSeconds: 30,
        },
      });

      const result = await rateQuestion(
        { questionId, rating: 'helpful' },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'RATE_LIMITED' },
      });
      expect(deps.rateQuestionUseCase.inputs).toEqual([]);
      expect(deps.rateLimiter.inputs).toEqual([
        {
          key: `question-feedback:rateQuestion:${deps._fixtures.userId}`,
          limit: 60,
          windowMs: 60_000,
        },
      ]);
    });

    it('returns NOT_FOUND when the use case throws ApplicationError', async () => {
      const deps = createDeps({
        rateQuestionThrows: new ApplicationError(
          'NOT_FOUND',
          'Question not found',
        ),
      });

      const result = await rateQuestion(
        { questionId, rating: 'helpful' },
        deps,
      );

      expect(result).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Question not found' },
      });
    });

    it('keeps genuine rate use-case ApplicationErrors cached when idempotencyKey is reused', async () => {
      const deps = createDeps({
        rateLimitResult: [
          {
            success: true,
            limit: 60,
            remaining: 59,
            retryAfterSeconds: 0,
          },
          {
            success: false,
            limit: 60,
            remaining: 0,
            retryAfterSeconds: 60,
          },
        ],
        rateQuestionThrows: new ApplicationError(
          'NOT_FOUND',
          'Question not found',
        ),
      });
      const input = { questionId, rating: 'helpful', idempotencyKey } as const;

      const first = await rateQuestion(input, deps);
      const second = await rateQuestion(input, deps);

      expect(first).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Question not found' },
      });
      expect(second).toEqual(first);
      expect(deps.rateQuestionUseCase.inputs).toHaveLength(1);
      expect(deps.rateLimiter.inputs).toHaveLength(1);
    });

    it('re-executes a request-keyed rating after a transient error', async () => {
      const deps = createDeps({
        rateQuestionThrows: new ApplicationError(
          'INTERNAL_ERROR',
          'database unavailable',
        ),
      });
      const input = { questionId, rating: 'helpful', idempotencyKey } as const;

      await rateQuestion(input, deps);
      await rateQuestion(input, deps);

      expect(deps.rateQuestionUseCase.inputs).toHaveLength(2);
      expect(deps.rateLimiter.inputs).toHaveLength(2);
    });

    it('returns ok when deps are loaded from the container', async () => {
      const deps = createDeps({ rateQuestionOutput: { rating: 'helpful' } });

      const result = await rateQuestion(
        { questionId, rating: 'helpful' },
        undefined,
        {
          loadContainer: async () => ({
            createQuestionFeedbackControllerDeps: () => deps,
          }),
        },
      );

      expect(result).toEqual({ ok: true, data: { rating: 'helpful' } });
    });
  });

  describe('getQuestionRating', () => {
    it('returns current rating without rate limiting', async () => {
      const deps = createDeps({
        getQuestionRatingOutput: { rating: 'helpful' },
      });

      const result = await getQuestionRating({ questionId }, deps);

      expect(result).toEqual({ ok: true, data: { rating: 'helpful' } });
      expect(deps.getQuestionRatingUseCase.inputs).toEqual([
        {
          userId: deps._fixtures.userId,
          questionId,
        },
      ]);
      expect(deps.rateLimiter.inputs).toEqual([]);
    });

    it('returns VALIDATION_ERROR when questionId is invalid', async () => {
      const deps = createDeps();

      const result = await getQuestionRating({ questionId: 'bad' }, deps);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
      expect(deps.getQuestionRatingUseCase.inputs).toEqual([]);
    });
  });

  describe('submitQuestionReport', () => {
    it('returns VALIDATION_ERROR when category is missing', async () => {
      const deps = createDeps();

      const result = await submitQuestionReport({ questionId }, deps);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
      expect(deps.submitQuestionReportUseCase.inputs).toEqual([]);
    });

    it('returns VALIDATION_ERROR when comment exceeds the feedback comment limit', async () => {
      const deps = createDeps();

      const result = await submitQuestionReport(
        {
          questionId,
          category: 'other',
          comment: 'a'.repeat(MAX_QUESTION_FEEDBACK_COMMENT_LENGTH + 1),
        },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          fieldErrors: { comment: expect.any(Array) },
        },
      });
      expect(deps.submitQuestionReportUseCase.inputs).toEqual([]);
    });

    it('returns ok and normalizes blank comments to null', async () => {
      const deps = createDeps({
        submitQuestionReportOutput: { feedbackId },
      });

      const result = await submitQuestionReport(
        {
          questionId,
          attemptId,
          practiceSessionId,
          category: 'ambiguous_wording',
          comment: '   ',
        },
        deps,
      );

      expect(result).toEqual({ ok: true, data: { feedbackId } });
      expect(deps.submitQuestionReportUseCase.inputs).toEqual([
        {
          userId: deps._fixtures.userId,
          questionId,
          attemptId,
          practiceSessionId,
          category: 'ambiguous_wording',
          comment: null,
        },
      ]);
      expect(deps.rateLimiter.inputs).toEqual([
        {
          key: `question-feedback:submitQuestionReport:${deps._fixtures.userId}`,
          limit: 10,
          windowMs: 60_000,
        },
      ]);
    });

    it('keeps successful reports idempotent when idempotencyKey is reused', async () => {
      const deps = createDeps({
        submitQuestionReportOutput: { feedbackId },
      });
      const input = {
        questionId,
        category: 'other',
        comment: 'Looks stale.',
        idempotencyKey,
      } as const;

      const first = await submitQuestionReport(input, deps);
      const second = await submitQuestionReport(input, deps);

      expect(first).toEqual({ ok: true, data: { feedbackId } });
      expect(second).toEqual(first);
      expect(deps.submitQuestionReportUseCase.inputs).toHaveLength(1);
      expect(deps.submitQuestionReportUseCase.inputs[0]).toMatchObject({
        idempotencyKey,
      });
      expect(deps.rateLimiter.inputs).toHaveLength(1);
    });

    it('returns the committed report when idempotency outcome storage fails', async () => {
      const deps = createDeps({
        submitQuestionReportOutput: { feedbackId },
      });
      const idempotencyRepository =
        new StoreResultFailingIdempotencyKeyRepository(deps.now);
      deps.idempotencyKeyRepository = idempotencyRepository;

      const result = await submitQuestionReport(
        {
          questionId,
          category: 'other',
          comment: 'Looks stale.',
          idempotencyKey,
        },
        deps,
      );

      expect(result).toEqual({ ok: true, data: { feedbackId } });
      expect(deps.submitQuestionReportUseCase.inputs).toHaveLength(1);
      await expect(
        idempotencyRepository.find(
          deps._fixtures.userId,
          'question-feedback:submitQuestionReport',
          idempotencyKey,
        ),
      ).resolves.toMatchObject({
        completedAt: null,
        error: null,
      });
    });

    it('returns the committed report when its idempotency claim was concurrently reclaimed', async () => {
      const deps = createDeps({
        submitQuestionReportOutput: { feedbackId },
      });
      deps.idempotencyKeyRepository = new StaleClaimIdempotencyKeyRepository(
        deps.now,
      );

      const result = await submitQuestionReport(
        {
          questionId,
          category: 'other',
          comment: 'Looks stale.',
          idempotencyKey,
        },
        deps,
      );

      expect(result).toEqual({ ok: true, data: { feedbackId } });
      expect(deps.submitQuestionReportUseCase.inputs).toHaveLength(1);
    });

    it('replays a cached report while the reused key is rate limited', async () => {
      const deps = createDeps({
        submitQuestionReportOutput: { feedbackId },
        rateLimitResult: [
          {
            success: true,
            limit: 10,
            remaining: 9,
            retryAfterSeconds: 0,
          },
          {
            success: false,
            limit: 10,
            remaining: 0,
            retryAfterSeconds: 60,
          },
        ],
      });
      const input = {
        questionId,
        category: 'other',
        comment: 'Looks stale.',
        idempotencyKey,
      } as const;

      const first = await submitQuestionReport(input, deps);
      const second = await submitQuestionReport(input, deps);

      expect(first).toEqual({ ok: true, data: { feedbackId } });
      expect(second).toEqual(first);
      expect(deps.submitQuestionReportUseCase.inputs).toHaveLength(1);
      expect(deps.rateLimiter.inputs).toHaveLength(1);
    });

    it('does not cache RATE_LIMITED under the idempotency key', async () => {
      const deps = createDeps({
        rateLimitResult: [
          {
            success: false,
            limit: 10,
            remaining: 0,
            retryAfterSeconds: 60,
          },
          {
            success: true,
            limit: 10,
            remaining: 9,
            retryAfterSeconds: 0,
          },
        ],
      });
      const input = {
        questionId,
        category: 'other',
        comment: 'Looks stale.',
        idempotencyKey,
      } as const;

      const first = await submitQuestionReport(input, deps);
      expect(first).toMatchObject({
        ok: false,
        error: { code: 'RATE_LIMITED' },
      });

      const second = await submitQuestionReport(input, deps);
      expect(second).toEqual({ ok: true, data: { feedbackId } });
      expect(deps.submitQuestionReportUseCase.inputs).toHaveLength(1);
    });

    it('returns RATE_LIMITED when report limit denies request', async () => {
      const deps = createDeps({
        rateLimitResult: {
          success: false,
          limit: 10,
          remaining: 0,
          retryAfterSeconds: 30,
        },
      });

      const result = await submitQuestionReport(
        { questionId, category: 'other' },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'RATE_LIMITED' },
      });
      expect(deps.submitQuestionReportUseCase.inputs).toEqual([]);
      expect(deps.rateLimiter.inputs).toEqual([
        {
          key: `question-feedback:submitQuestionReport:${deps._fixtures.userId}`,
          limit: 10,
          windowMs: 60_000,
        },
      ]);
    });

    it('keeps genuine report use-case ApplicationErrors cached when idempotencyKey is reused', async () => {
      const deps = createDeps({
        rateLimitResult: [
          {
            success: true,
            limit: 10,
            remaining: 9,
            retryAfterSeconds: 0,
          },
          {
            success: false,
            limit: 10,
            remaining: 0,
            retryAfterSeconds: 60,
          },
        ],
        submitQuestionReportThrows: new ApplicationError(
          'NOT_FOUND',
          'Question not found',
        ),
      });
      const input = {
        questionId,
        category: 'other',
        idempotencyKey,
      } as const;

      const first = await submitQuestionReport(input, deps);
      const second = await submitQuestionReport(input, deps);

      expect(first).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Question not found' },
      });
      expect(second).toEqual(first);
      expect(deps.submitQuestionReportUseCase.inputs).toHaveLength(1);
      expect(deps.rateLimiter.inputs).toHaveLength(1);
    });

    it('re-executes a request-keyed report after a transient error', async () => {
      const deps = createDeps({
        submitQuestionReportThrows: new Error('connection reset'),
      });
      const input = {
        questionId,
        category: 'other',
        idempotencyKey,
      } as const;

      await submitQuestionReport(input, deps);
      await submitQuestionReport(input, deps);

      expect(deps.submitQuestionReportUseCase.inputs).toHaveLength(2);
      expect(deps.rateLimiter.inputs).toHaveLength(2);
    });
  });
});
