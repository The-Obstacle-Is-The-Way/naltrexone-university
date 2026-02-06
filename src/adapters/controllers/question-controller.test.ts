// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import type {
  AuthGateway,
  RateLimiter,
} from '@/src/application/ports/gateways';
import {
  FakeAuthGateway,
  FakeGetNextQuestionUseCase,
  FakeIdempotencyKeyRepository,
  FakeRateLimiter,
  FakeSubmitAnswerUseCase,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import { CheckEntitlementUseCase } from '@/src/application/use-cases/check-entitlement';
import type { GetNextQuestionOutput } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import { createSubscription, createUser } from '@/src/domain/test-helpers';
import {
  getNextQuestion,
  type QuestionControllerDeps,
  submitAnswer,
} from './question-controller';

type QuestionControllerTestDeps = QuestionControllerDeps & {
  getNextQuestionUseCase: FakeGetNextQuestionUseCase;
  submitAnswerUseCase: FakeSubmitAnswerUseCase;
};

function createDeps(overrides?: {
  user?: ReturnType<typeof createUser> | null;
  authGateway?: AuthGateway;
  rateLimiter?: RateLimiter;
  isEntitled?: boolean;
  getNextQuestionOutput?: GetNextQuestionOutput;
  submitAnswerOutput?: SubmitAnswerOutput;
  getNextQuestionThrows?: unknown;
  submitAnswerThrows?: unknown;
}): QuestionControllerTestDeps {
  const user =
    overrides?.user ??
    createUser({
      id: 'user_1',
      email: 'user@example.com',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    });

  const now = new Date('2026-02-01T00:00:00Z');

  const authGateway: AuthGateway =
    overrides?.authGateway ?? new FakeAuthGateway(user);

  const subscriptionRepository = new FakeSubscriptionRepository(
    overrides?.isEntitled === false
      ? []
      : [
          createSubscription({
            userId: user?.id ?? 'user_1',
            status: 'active',
            currentPeriodEnd: new Date('2026-12-31T00:00:00Z'),
          }),
        ],
  );

  const checkEntitlementUseCase = new CheckEntitlementUseCase(
    subscriptionRepository,
    () => now,
  );

  const idempotencyKeyRepository = new FakeIdempotencyKeyRepository(() => now);

  const getNextQuestionUseCase = new FakeGetNextQuestionUseCase(
    overrides?.getNextQuestionOutput ?? null,
    overrides?.getNextQuestionThrows,
  );

  const rateLimiter: RateLimiter =
    overrides?.rateLimiter ?? new FakeRateLimiter();

  const submitAnswerUseCase = new FakeSubmitAnswerUseCase(
    overrides?.submitAnswerOutput ?? {
      attemptId: '44444444-4444-4444-4444-444444444444',
      isCorrect: true,
      correctChoiceId: '55555555-5555-5555-5555-555555555555',
      explanationMd: 'Because...',
      choiceExplanations: [],
    },
    overrides?.submitAnswerThrows,
  );

  return {
    authGateway,
    rateLimiter,
    idempotencyKeyRepository,
    checkEntitlementUseCase,
    getNextQuestionUseCase,
    submitAnswerUseCase,
  };
}

describe('question-controller', () => {
  describe('getNextQuestion', () => {
    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createDeps();

      const result = await getNextQuestion({ sessionId: 'not-a-uuid' }, deps);

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          fieldErrors: { sessionId: expect.any(Array) },
        },
      });
    });

    it('returns UNAUTHENTICATED when unauthenticated', async () => {
      const deps = createDeps({
        authGateway: new FakeAuthGateway(null),
      });

      const result = await getNextQuestion(
        { filters: { tagSlugs: [], difficulties: [] } },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
    });

    it('returns UNSUBSCRIBED when not entitled', async () => {
      const deps = createDeps({ isEntitled: false });

      const result = await getNextQuestion(
        { filters: { tagSlugs: [], difficulties: [] } },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
      expect(deps.getNextQuestionUseCase.inputs).toEqual([]);
    });

    it('returns ok result when filters are provided', async () => {
      const deps = createDeps({ getNextQuestionOutput: null });

      const result = await getNextQuestion(
        { filters: { tagSlugs: [], difficulties: [] } },
        deps,
      );

      expect(result).toEqual({ ok: true, data: null });
      expect(deps.getNextQuestionUseCase.inputs).toEqual([
        { userId: 'user_1', filters: { tagSlugs: [], difficulties: [] } },
      ]);
    });

    it('returns ok result when sessionId is provided', async () => {
      const deps = createDeps({
        getNextQuestionOutput: {
          questionId: 'q_1',
          slug: 'q-1',
          stemMd: 'Stem',
          difficulty: 'easy',
          choices: [
            {
              id: 'choice_1',
              label: 'A',
              textMd: 'Choice',
              sortOrder: 1,
            },
          ],
          session: null,
        },
      });

      const sessionId = '11111111-1111-1111-1111-111111111111';
      const result = await getNextQuestion({ sessionId }, deps);

      expect(result).toMatchObject({ ok: true, data: { questionId: 'q_1' } });
      expect(deps.getNextQuestionUseCase.inputs).toEqual([
        { userId: 'user_1', sessionId },
      ]);
    });

    it('forwards questionId when sessionId and questionId are provided', async () => {
      const deps = createDeps({ getNextQuestionOutput: null });
      const sessionId = '11111111-1111-1111-1111-111111111111';
      const questionId = '22222222-2222-2222-2222-222222222222';

      const result = await getNextQuestion({ sessionId, questionId }, deps);

      expect(result).toEqual({ ok: true, data: null });
      expect(deps.getNextQuestionUseCase.inputs).toEqual([
        { userId: 'user_1', sessionId, questionId },
      ]);
    });

    it('returns NOT_FOUND when use case throws ApplicationError', async () => {
      const deps = createDeps({
        getNextQuestionThrows: new ApplicationError('NOT_FOUND', 'Not found'),
      });

      const result = await getNextQuestion(
        { filters: { tagSlugs: [], difficulties: [] } },
        deps,
      );

      expect(result).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Not found' },
      });
    });
  });

  describe('submitAnswer', () => {
    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createDeps();

      const result = await submitAnswer(
        { questionId: 'bad', choiceId: 'bad' },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          fieldErrors: {
            questionId: expect.any(Array),
            choiceId: expect.any(Array),
          },
        },
      });
    });

    it('returns UNSUBSCRIBED when not entitled', async () => {
      const deps = createDeps({ isEntitled: false });

      const result = await submitAnswer(
        {
          questionId: '11111111-1111-1111-1111-111111111111',
          choiceId: '22222222-2222-2222-2222-222222222222',
        },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
      expect(deps.submitAnswerUseCase.inputs).toEqual([]);
    });

    it('returns RATE_LIMITED when rate limited', async () => {
      const deps = createDeps({
        rateLimiter: new FakeRateLimiter({
          success: false,
          limit: 120,
          remaining: 0,
          retryAfterSeconds: 60,
        }),
      });

      const result = await submitAnswer(
        {
          questionId: '11111111-1111-1111-1111-111111111111',
          choiceId: '22222222-2222-2222-2222-222222222222',
        },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'RATE_LIMITED' },
      });
      expect(deps.submitAnswerUseCase.inputs).toEqual([]);
    });

    it('returns ok result when use case succeeds', async () => {
      const deps = createDeps({
        submitAnswerOutput: {
          attemptId: '66666666-6666-6666-6666-666666666666',
          isCorrect: false,
          correctChoiceId: '77777777-7777-7777-7777-777777777777',
          explanationMd: null,
          choiceExplanations: [],
        },
      });

      const input = {
        questionId: '11111111-1111-1111-1111-111111111111',
        choiceId: '22222222-2222-2222-2222-222222222222',
        sessionId: '33333333-3333-3333-3333-333333333333',
      };

      const result = await submitAnswer(input, deps);

      expect(result).toEqual({
        ok: true,
        data: {
          attemptId: '66666666-6666-6666-6666-666666666666',
          isCorrect: false,
          correctChoiceId: '77777777-7777-7777-7777-777777777777',
          explanationMd: null,
          choiceExplanations: [],
        },
      });
      expect(deps.submitAnswerUseCase.inputs).toEqual([
        {
          userId: 'user_1',
          questionId: input.questionId,
          choiceId: input.choiceId,
          sessionId: input.sessionId,
          timeSpentSeconds: undefined,
        },
      ]);
    });

    it('returns ok result when timeSpentSeconds is provided', async () => {
      const deps = createDeps();

      const input = {
        questionId: '11111111-1111-1111-1111-111111111111',
        choiceId: '22222222-2222-2222-2222-222222222222',
        timeSpentSeconds: 15,
      };

      await submitAnswer(input, deps);

      expect(deps.submitAnswerUseCase.inputs[0]).toMatchObject({
        userId: 'user_1',
        questionId: input.questionId,
        choiceId: input.choiceId,
        timeSpentSeconds: 15,
      });
    });

    it('returns the cached result when idempotencyKey is reused', async () => {
      const deps = createDeps();

      const input = {
        questionId: '11111111-1111-1111-1111-111111111111',
        choiceId: '22222222-2222-2222-2222-222222222222',
        idempotencyKey: '33333333-3333-3333-3333-333333333333',
      };

      const first = await submitAnswer(input, deps);
      const second = await submitAnswer(input, deps);

      expect(first).toEqual({
        ok: true,
        data: {
          attemptId: '44444444-4444-4444-4444-444444444444',
          isCorrect: true,
          correctChoiceId: '55555555-5555-5555-5555-555555555555',
          explanationMd: 'Because...',
          choiceExplanations: [],
        },
      });
      expect(second).toEqual(first);
      expect(deps.submitAnswerUseCase.inputs).toHaveLength(1);
    });

    it('returns VALIDATION_ERROR when timeSpentSeconds is negative', async () => {
      const deps = createDeps();

      const result = await submitAnswer(
        {
          questionId: '11111111-1111-1111-1111-111111111111',
          choiceId: '22222222-2222-2222-2222-222222222222',
          timeSpentSeconds: -1,
        },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          fieldErrors: { timeSpentSeconds: expect.any(Array) },
        },
      });
    });

    it('returns VALIDATION_ERROR when timeSpentSeconds exceeds 24 hours', async () => {
      const deps = createDeps();

      const result = await submitAnswer(
        {
          questionId: '11111111-1111-1111-1111-111111111111',
          choiceId: '22222222-2222-2222-2222-222222222222',
          timeSpentSeconds: 86401,
        },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          fieldErrors: { timeSpentSeconds: expect.any(Array) },
        },
      });
    });

    it('returns NOT_FOUND when use case throws ApplicationError', async () => {
      const deps = createDeps({
        submitAnswerThrows: new ApplicationError(
          'NOT_FOUND',
          'Question not found',
        ),
      });

      const result = await submitAnswer(
        {
          questionId: '11111111-1111-1111-1111-111111111111',
          choiceId: '22222222-2222-2222-2222-222222222222',
        },
        deps,
      );

      expect(result).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Question not found' },
      });
    });
  });
});
