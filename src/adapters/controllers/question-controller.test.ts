import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import type { AuthGateway } from '@/src/application/ports/gateways';
import {
  FakeAuthGateway,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import { CheckEntitlementUseCase } from '@/src/application/use-cases/check-entitlement';
import type {
  GetNextQuestionInput,
  GetNextQuestionOutput,
} from '@/src/application/use-cases/get-next-question';
import type {
  SubmitAnswerInput,
  SubmitAnswerOutput,
} from '@/src/application/use-cases/submit-answer';
import { createSubscription, createUser } from '@/src/domain/test-helpers';
import { getNextQuestion, submitAnswer } from './question-controller';

class FakeGetNextQuestionUseCase {
  readonly inputs: GetNextQuestionInput[] = [];

  constructor(
    private readonly output: GetNextQuestionOutput,
    private readonly toThrow?: unknown,
  ) {}

  async execute(input: GetNextQuestionInput): Promise<GetNextQuestionOutput> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

class FakeSubmitAnswerUseCase {
  readonly inputs: SubmitAnswerInput[] = [];

  constructor(
    private readonly output: SubmitAnswerOutput,
    private readonly toThrow?: unknown,
  ) {}

  async execute(input: SubmitAnswerInput): Promise<SubmitAnswerOutput> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

function createDeps(overrides?: {
  user?: ReturnType<typeof createUser> | null;
  authGateway?: AuthGateway;
  isEntitled?: boolean;
  getNextQuestionOutput?: GetNextQuestionOutput;
  submitAnswerOutput?: SubmitAnswerOutput;
  getNextQuestionThrows?: unknown;
  submitAnswerThrows?: unknown;
}) {
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

  const getNextQuestionUseCase = new FakeGetNextQuestionUseCase(
    overrides?.getNextQuestionOutput ?? null,
    overrides?.getNextQuestionThrows,
  );

  const submitAnswerUseCase = new FakeSubmitAnswerUseCase(
    overrides?.submitAnswerOutput ?? {
      attemptId: 'attempt_1',
      isCorrect: true,
      correctChoiceId: 'choice_1',
      explanationMd: 'Because...',
    },
    overrides?.submitAnswerThrows,
  );

  return {
    authGateway,
    checkEntitlementUseCase,
    getNextQuestionUseCase,
    submitAnswerUseCase,
  };
}

describe('question-controller', () => {
  describe('getNextQuestion', () => {
    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createDeps();

      const result = await getNextQuestion(
        { sessionId: 'not-a-uuid' },
        deps as never,
      );

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
        deps as never,
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
        deps as never,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
      expect(deps.getNextQuestionUseCase.inputs).toEqual([]);
    });

    it('returns ok result from the use case (filters)', async () => {
      const deps = createDeps({ getNextQuestionOutput: null });

      const result = await getNextQuestion(
        { filters: { tagSlugs: [], difficulties: [] } },
        deps as never,
      );

      expect(result).toEqual({ ok: true, data: null });
      expect(deps.getNextQuestionUseCase.inputs).toEqual([
        { userId: 'user_1', filters: { tagSlugs: [], difficulties: [] } },
      ]);
    });

    it('passes sessionId to the use case when provided', async () => {
      const deps = createDeps({
        getNextQuestionOutput: { questionId: 'q_1' } as never,
      });

      const sessionId = '11111111-1111-1111-1111-111111111111';
      const result = await getNextQuestion({ sessionId }, deps as never);

      expect(result).toEqual({ ok: true, data: { questionId: 'q_1' } });
      expect(deps.getNextQuestionUseCase.inputs).toEqual([
        { userId: 'user_1', sessionId },
      ]);
    });

    it('maps ApplicationError from use case via handleError', async () => {
      const deps = createDeps({
        getNextQuestionThrows: new ApplicationError('NOT_FOUND', 'Not found'),
      });

      const result = await getNextQuestion(
        { filters: { tagSlugs: [], difficulties: [] } },
        deps as never,
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
        deps as never,
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
        deps as never,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
      expect(deps.submitAnswerUseCase.inputs).toEqual([]);
    });

    it('returns ok result from the use case', async () => {
      const deps = createDeps({
        submitAnswerOutput: {
          attemptId: 'attempt_2',
          isCorrect: false,
          correctChoiceId: 'choice_correct',
          explanationMd: null,
        },
      });

      const input = {
        questionId: '11111111-1111-1111-1111-111111111111',
        choiceId: '22222222-2222-2222-2222-222222222222',
        sessionId: '33333333-3333-3333-3333-333333333333',
      };

      const result = await submitAnswer(input, deps as never);

      expect(result).toEqual({
        ok: true,
        data: {
          attemptId: 'attempt_2',
          isCorrect: false,
          correctChoiceId: 'choice_correct',
          explanationMd: null,
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

    it('accepts timeSpentSeconds in input and passes to use case', async () => {
      const deps = createDeps();

      const input = {
        questionId: '11111111-1111-1111-1111-111111111111',
        choiceId: '22222222-2222-2222-2222-222222222222',
        timeSpentSeconds: 15,
      };

      await submitAnswer(input, deps as never);

      expect(deps.submitAnswerUseCase.inputs[0]).toMatchObject({
        userId: 'user_1',
        questionId: input.questionId,
        choiceId: input.choiceId,
        timeSpentSeconds: 15,
      });
    });

    it('rejects negative timeSpentSeconds', async () => {
      const deps = createDeps();

      const result = await submitAnswer(
        {
          questionId: '11111111-1111-1111-1111-111111111111',
          choiceId: '22222222-2222-2222-2222-222222222222',
          timeSpentSeconds: -1,
        },
        deps as never,
      );

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          fieldErrors: { timeSpentSeconds: expect.any(Array) },
        },
      });
    });

    it('rejects timeSpentSeconds exceeding 24 hours', async () => {
      const deps = createDeps();

      const result = await submitAnswer(
        {
          questionId: '11111111-1111-1111-1111-111111111111',
          choiceId: '22222222-2222-2222-2222-222222222222',
          timeSpentSeconds: 86401,
        },
        deps as never,
      );

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          fieldErrors: { timeSpentSeconds: expect.any(Array) },
        },
      });
    });

    it('maps ApplicationError from use case via handleError', async () => {
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
        deps as never,
      );

      expect(result).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Question not found' },
      });
    });
  });
});
