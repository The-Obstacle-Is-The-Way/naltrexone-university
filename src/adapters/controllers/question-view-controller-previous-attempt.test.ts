import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { createUser } from '@/src/domain/test-helpers';
import { getPreviousAttempt } from './question-view-controller';
import { createQuestionViewControllerDeps } from './test-helpers/question-view-controller-test-helpers';

const validPreviousAttemptQuestionId = '00000000-0000-4000-8000-000000000010';

describe('question-view-controller', () => {
  describe('getPreviousAttempt', () => {
    class ThrowingInfoLogger extends FakeLogger {
      override info(_context: Record<string, unknown>, _msg: string): void {
        throw new Error('logger info failed');
      }
    }

    class ThrowingWarnLogger extends FakeLogger {
      override warn(_context: Record<string, unknown>, _msg: string): void {
        throw new Error('logger warn failed');
      }
    }

    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createQuestionViewControllerDeps();

      const result = await getPreviousAttempt(
        { questionId: '' },
        deps as never,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
    });

    it('returns VALIDATION_ERROR when questionId is not a UUID and does not call the use case', async () => {
      let executeCalled = false;
      const deps = createQuestionViewControllerDeps({
        getPreviousAttemptUseCase: {
          execute: async () => {
            executeCalled = true;
            return null;
          },
        },
      });

      const result = await getPreviousAttempt(
        { questionId: 'not-a-uuid' },
        deps as never,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
      expect(executeCalled).toBe(false);
    });

    it('returns VALIDATION_ERROR when both attemptId and sessionId are provided', async () => {
      const deps = createQuestionViewControllerDeps();

      const result = await getPreviousAttempt(
        {
          questionId: validPreviousAttemptQuestionId,
          attemptId: '00000000-0000-4000-8000-000000000001',
          sessionId: '00000000-0000-4000-8000-000000000002',
        },
        deps as never,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
    });

    it('returns UNAUTHENTICATED when unauthenticated', async () => {
      const deps = createQuestionViewControllerDeps({ user: null });

      const result = await getPreviousAttempt(
        { questionId: validPreviousAttemptQuestionId },
        deps as never,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
    });

    it('returns UNSUBSCRIBED when not entitled', async () => {
      let executeCalled = false;
      const deps = createQuestionViewControllerDeps({
        isEntitled: false,
        getPreviousAttemptUseCase: {
          execute: async () => {
            executeCalled = true;
            return null;
          },
        },
      });

      const result = await getPreviousAttempt(
        { questionId: validPreviousAttemptQuestionId },
        deps as never,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
      expect(executeCalled).toBe(false);
    });

    it('passes attemptId to use case when provided', async () => {
      const userId = crypto.randomUUID();
      const questionId = validPreviousAttemptQuestionId;
      const attemptId = '00000000-0000-4000-8000-000000000001';

      let receivedInput: {
        userId: string;
        questionId: string;
        attemptId?: string;
      } | null = null;
      const deps = createQuestionViewControllerDeps({
        getPreviousAttemptUseCase: {
          execute: async (input) => {
            receivedInput = input;
            return null;
          },
        },
        user: createUser({ id: userId }),
      });

      const result = await getPreviousAttempt(
        { questionId, attemptId },
        deps as never,
      );

      expect(receivedInput).toEqual({ userId, questionId, attemptId });
      expect(result).toEqual({ ok: true, data: null });
    });

    it('passes sessionId to use case when provided', async () => {
      const userId = crypto.randomUUID();
      const questionId = validPreviousAttemptQuestionId;
      const sessionId = '00000000-0000-4000-8000-000000000002';

      let receivedInput: {
        userId: string;
        questionId: string;
        sessionId?: string;
      } | null = null;
      const deps = createQuestionViewControllerDeps({
        getPreviousAttemptUseCase: {
          execute: async (input) => {
            receivedInput = input;
            return null;
          },
        },
        user: createUser({ id: userId }),
      });

      const result = await getPreviousAttempt(
        { questionId, sessionId },
        deps as never,
      );

      expect(receivedInput).toEqual({ userId, questionId, sessionId });
      expect(result).toEqual({ ok: true, data: null });
    });

    it('returns the previous attempt when found', async () => {
      const userId = crypto.randomUUID();
      const questionId = validPreviousAttemptQuestionId;
      const attemptId = crypto.randomUUID();
      const choiceId = crypto.randomUUID();
      const logger = new FakeLogger();

      let receivedInput: {
        userId: string;
        questionId: string;
        attemptId?: string;
      } | null = null;
      const deps = createQuestionViewControllerDeps({
        logger,
        getPreviousAttemptUseCase: {
          execute: async (input) => {
            receivedInput = input;
            return {
              kind: 'attempt',
              attemptId,
              selectedChoiceId: choiceId,
              isCorrect: true,
              correctChoiceId: choiceId,
              explanationMd: 'Explanation',
              choiceExplanations: [],
              answeredAt: '2026-02-01T00:00:00.000Z',
            };
          },
        },
        user: createUser({ id: userId }),
      });

      const result = await getPreviousAttempt({ questionId }, deps as never);

      expect(receivedInput).toEqual({ userId, questionId });
      expect(result).toEqual({
        ok: true,
        data: {
          kind: 'attempt',
          attemptId,
          selectedChoiceId: choiceId,
          isCorrect: true,
          correctChoiceId: choiceId,
          explanationMd: 'Explanation',
          choiceExplanations: [],
          answeredAt: '2026-02-01T00:00:00.000Z',
        },
      });
      expect(logger.infoCalls).toContainEqual({
        context: {
          event: 'review_hydration_outcome',
          mode: 'review',
          outcome: 'attempt',
          hasAttemptId: false,
          hasSessionId: false,
          questionId,
          userId,
        },
        msg: 'Review hydration outcome',
      });
    });

    it('returns the previous attempt when hydration telemetry info logging throws', async () => {
      const userId = crypto.randomUUID();
      const questionId = validPreviousAttemptQuestionId;
      const attemptId = crypto.randomUUID();
      const choiceId = crypto.randomUUID();
      const logger = new ThrowingInfoLogger();

      const deps = createQuestionViewControllerDeps({
        logger,
        getPreviousAttemptUseCase: {
          execute: async () => ({
            kind: 'attempt',
            attemptId,
            selectedChoiceId: choiceId,
            isCorrect: true,
            correctChoiceId: choiceId,
            explanationMd: 'Explanation',
            choiceExplanations: [],
            answeredAt: '2026-02-01T00:00:00.000Z',
          }),
        },
        user: createUser({ id: userId }),
      });

      const result = await getPreviousAttempt({ questionId }, deps as never);

      expect(result).toEqual({
        ok: true,
        data: {
          kind: 'attempt',
          attemptId,
          selectedChoiceId: choiceId,
          isCorrect: true,
          correctChoiceId: choiceId,
          explanationMd: 'Explanation',
          choiceExplanations: [],
          answeredAt: '2026-02-01T00:00:00.000Z',
        },
      });
    });

    it('returns NOT_FOUND when attemptId does not match questionId', async () => {
      const deps = createQuestionViewControllerDeps({
        getPreviousAttemptUseCase: {
          execute: async () => {
            throw new ApplicationError(
              'NOT_FOUND',
              'Previous attempt does not belong to the requested question',
            );
          },
        },
      });

      const result = await getPreviousAttempt(
        { questionId: validPreviousAttemptQuestionId },
        deps as never,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'NOT_FOUND' },
      });
    });

    it('emits session_unanswered hydration telemetry when unanswered session reveal is returned', async () => {
      const correctChoiceId = crypto.randomUUID();
      const logger = new FakeLogger();
      const deps = createQuestionViewControllerDeps({
        logger,
        getPreviousAttemptUseCase: {
          execute: async () => ({
            kind: 'session_unanswered',
            correctChoiceId,
            explanationMd: 'Explanation',
            referenceMd: null,
            choiceExplanations: [],
          }),
        },
      });

      const result = await getPreviousAttempt(
        {
          questionId: validPreviousAttemptQuestionId,
          sessionId: '00000000-0000-4000-8000-000000000001',
        },
        deps as never,
      );

      expect(result).toEqual({
        ok: true,
        data: {
          kind: 'session_unanswered',
          correctChoiceId,
          explanationMd: 'Explanation',
          referenceMd: null,
          choiceExplanations: [],
        },
      });
      expect(logger.infoCalls).toContainEqual({
        context: {
          event: 'review_hydration_outcome',
          mode: 'review',
          outcome: 'session_unanswered',
          hasAttemptId: false,
          hasSessionId: true,
          questionId: validPreviousAttemptQuestionId,
          userId: deps._fixtures.userId,
        },
        msg: 'Review hydration outcome',
      });
    });

    it('returns null when there is no previous attempt', async () => {
      const logger = new FakeLogger();
      const deps = createQuestionViewControllerDeps({
        logger,
        getPreviousAttemptUseCase: {
          execute: async () => null,
        },
      });

      const result = await getPreviousAttempt(
        { questionId: validPreviousAttemptQuestionId },
        deps as never,
      );

      expect(result).toEqual({ ok: true, data: null });
      expect(logger.infoCalls).toContainEqual({
        context: {
          event: 'review_hydration_outcome',
          mode: 'review',
          outcome: 'no_prior_attempt',
          hasAttemptId: false,
          hasSessionId: false,
          questionId: validPreviousAttemptQuestionId,
          userId: deps._fixtures.userId,
        },
        msg: 'Review hydration outcome',
      });
    });

    it('emits hydration_error telemetry when getPreviousAttempt use case throws', async () => {
      const logger = new FakeLogger();
      const deps = createQuestionViewControllerDeps({
        logger,
        getPreviousAttemptUseCase: {
          execute: async () => {
            throw new ApplicationError('INTERNAL_ERROR', 'Boom');
          },
        },
      });

      const result = await getPreviousAttempt(
        { questionId: validPreviousAttemptQuestionId },
        deps as never,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'INTERNAL_ERROR' },
      });
      expect(logger.warnCalls).toContainEqual({
        context: {
          event: 'review_hydration_outcome',
          mode: 'review',
          outcome: 'hydration_error',
          hasAttemptId: false,
          hasSessionId: false,
          questionId: validPreviousAttemptQuestionId,
          userId: deps._fixtures.userId,
          errorCode: 'INTERNAL_ERROR',
        },
        msg: 'Review hydration outcome',
      });
    });

    it('preserves the original use-case error when hydration telemetry warn logging throws', async () => {
      const logger = new ThrowingWarnLogger();
      const deps = createQuestionViewControllerDeps({
        logger,
        getPreviousAttemptUseCase: {
          execute: async () => {
            throw new ApplicationError('NOT_FOUND', 'Previous attempt missing');
          },
        },
      });

      const result = await getPreviousAttempt(
        { questionId: validPreviousAttemptQuestionId },
        deps as never,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'NOT_FOUND' },
      });
    });
  });
});
