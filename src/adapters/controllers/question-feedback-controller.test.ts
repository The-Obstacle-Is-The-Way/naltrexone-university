// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
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

    it('returns the cached rating result when idempotencyKey is reused', async () => {
      const deps = createDeps({ rateQuestionOutput: { rating: null } });
      const input = { questionId, rating: null, idempotencyKey } as const;

      const first = await rateQuestion(input, deps);
      const second = await rateQuestion(input, deps);

      expect(first).toEqual({ ok: true, data: { rating: null } });
      expect(second).toEqual(first);
      expect(deps.rateQuestionUseCase.inputs).toHaveLength(1);
      expect(deps.rateLimiter.inputs).toHaveLength(1);
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

    it('returns the cached report result when idempotencyKey is reused', async () => {
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
      expect(deps.rateLimiter.inputs).toHaveLength(1);
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
  });
});
