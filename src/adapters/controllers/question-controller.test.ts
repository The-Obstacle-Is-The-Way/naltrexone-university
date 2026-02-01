import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import type { AuthGateway } from '@/src/application/ports/gateways';
import { getNextQuestion, submitAnswer } from './question-controller';

type UserLike = {
  id: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
};

function createUser(): UserLike {
  return {
    id: 'user_1',
    email: 'user@example.com',
    createdAt: new Date('2026-02-01T00:00:00Z'),
    updatedAt: new Date('2026-02-01T00:00:00Z'),
  };
}

function createDeps(overrides?: {
  user?: UserLike;
  authGateway?: Partial<AuthGateway>;
  isEntitled?: boolean;
  getNextQuestionResult?: unknown;
  submitAnswerResult?: unknown;
  getNextQuestionThrows?: unknown;
  submitAnswerThrows?: unknown;
}) {
  const user = overrides?.user ?? createUser();
  const isEntitled = overrides?.isEntitled ?? true;

  const authGateway: AuthGateway = {
    getCurrentUser: async () => user as never,
    requireUser: async () => user as never,
    ...overrides?.authGateway,
  };

  const checkEntitlementUseCase = {
    execute: vi.fn(async () => ({ isEntitled })),
  };

  const getNextQuestionUseCase = {
    execute: vi.fn(async () => {
      if (overrides?.getNextQuestionThrows)
        throw overrides.getNextQuestionThrows;
      return overrides?.getNextQuestionResult ?? null;
    }),
  };

  const submitAnswerUseCase = {
    execute: vi.fn(async () => {
      if (overrides?.submitAnswerThrows) throw overrides.submitAnswerThrows;
      return (
        overrides?.submitAnswerResult ?? {
          attemptId: 'attempt_1',
          isCorrect: true,
          correctChoiceId: 'choice_1',
          explanationMd: 'Because...',
        }
      );
    }),
  };

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
        authGateway: {
          requireUser: async () => {
            throw new ApplicationError('UNAUTHENTICATED', 'No session');
          },
        },
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
      expect(deps.getNextQuestionUseCase.execute).not.toHaveBeenCalled();
    });

    it('returns ok result from the use case (filters)', async () => {
      const deps = createDeps({ getNextQuestionResult: null });

      const result = await getNextQuestion(
        { filters: { tagSlugs: [], difficulties: [] } },
        deps as never,
      );

      expect(result).toEqual({ ok: true, data: null });
      expect(deps.getNextQuestionUseCase.execute).toHaveBeenCalledWith({
        userId: 'user_1',
        filters: { tagSlugs: [], difficulties: [] },
      });
    });

    it('passes sessionId to the use case when provided', async () => {
      const deps = createDeps({ getNextQuestionResult: { questionId: 'q_1' } });

      const sessionId = '11111111-1111-1111-1111-111111111111';
      const result = await getNextQuestion({ sessionId }, deps as never);

      expect(result).toEqual({ ok: true, data: { questionId: 'q_1' } });
      expect(deps.getNextQuestionUseCase.execute).toHaveBeenCalledWith({
        userId: 'user_1',
        sessionId,
      });
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
      expect(deps.submitAnswerUseCase.execute).not.toHaveBeenCalled();
    });

    it('returns ok result from the use case', async () => {
      const deps = createDeps({
        submitAnswerResult: {
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
      expect(deps.submitAnswerUseCase.execute).toHaveBeenCalledWith({
        userId: 'user_1',
        questionId: input.questionId,
        choiceId: input.choiceId,
        sessionId: input.sessionId,
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
