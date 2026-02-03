import { describe, expect, it, vi } from 'vitest';
import {
  createLoadNextQuestionAction,
  endSession,
  loadNextQuestion,
  submitAnswerForQuestion,
} from '@/app/(app)/app/practice/[sessionId]/practice-session-page-logic';
import { err, ok } from '@/src/adapters/controllers/action-result';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';

function createNextQuestion(overrides?: Partial<NextQuestion>): NextQuestion {
  return {
    questionId: 'q_1',
    slug: 'q-1',
    stemMd: '#',
    difficulty: 'easy',
    choices: [],
    session: null,
    ...overrides,
  };
}

describe('practice-session-page-logic', () => {
  describe('loadNextQuestion', () => {
    it('loads the next question and updates sessionInfo when present', async () => {
      const setLoadState = vi.fn();
      const setSelectedChoiceId = vi.fn();
      const setSubmitResult = vi.fn();
      const setSubmitIdempotencyKey = vi.fn();
      const setQuestionLoadedAt = vi.fn();
      const setQuestion = vi.fn();
      const setSessionInfo = vi.fn();

      await loadNextQuestion({
        sessionId: 'session-1',
        getNextQuestionFn: async () =>
          ok(
            createNextQuestion({
              session: {
                sessionId: 'session-1',
                mode: 'tutor',
                index: 0,
                total: 2,
              },
            }),
          ),
        createIdempotencyKey: () => 'idem_1',
        nowMs: () => 1234,
        setLoadState,
        setSelectedChoiceId,
        setSubmitResult,
        setSubmitIdempotencyKey,
        setQuestionLoadedAt,
        setQuestion,
        setSessionInfo,
      });

      expect(setQuestion).toHaveBeenCalledWith(
        expect.objectContaining({ questionId: 'q_1' }),
      );
      expect(setQuestionLoadedAt).toHaveBeenCalledWith(1234);
      expect(setSubmitIdempotencyKey).toHaveBeenLastCalledWith('idem_1');
      expect(setSessionInfo).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'tutor', index: 0 }),
      );
      expect(setLoadState).toHaveBeenCalledWith({ status: 'ready' });
    });

    it('sets error state when controller fails', async () => {
      const setLoadState = vi.fn();
      const setQuestion = vi.fn();
      const setSubmitIdempotencyKey = vi.fn();

      await loadNextQuestion({
        sessionId: 'session-1',
        getNextQuestionFn: async () => err('INTERNAL_ERROR', 'Boom'),
        createIdempotencyKey: () => 'idem_1',
        nowMs: () => 0,
        setLoadState,
        setSelectedChoiceId: vi.fn(),
        setSubmitResult: vi.fn(),
        setSubmitIdempotencyKey,
        setQuestionLoadedAt: vi.fn(),
        setQuestion,
        setSessionInfo: vi.fn(),
      });

      expect(setQuestion).toHaveBeenCalledWith(null);
      expect(setLoadState).toHaveBeenCalledWith({
        status: 'error',
        message: 'Boom',
      });
      expect(setSubmitIdempotencyKey).toHaveBeenLastCalledWith(null);
    });
  });

  describe('createLoadNextQuestionAction', () => {
    it('runs load inside startTransition', () => {
      const startTransition = vi.fn((fn: () => void) => fn());
      const setLoadState = vi.fn();

      const action = createLoadNextQuestionAction({
        sessionId: 'session-1',
        startTransition,
        getNextQuestionFn: async () => ok(createNextQuestion()),
        createIdempotencyKey: () => 'idem_1',
        nowMs: () => 0,
        setLoadState,
        setSelectedChoiceId: vi.fn(),
        setSubmitResult: vi.fn(),
        setSubmitIdempotencyKey: vi.fn(),
        setQuestionLoadedAt: vi.fn(),
        setQuestion: vi.fn(),
        setSessionInfo: vi.fn(),
      });

      action();

      expect(startTransition).toHaveBeenCalledTimes(1);
      expect(setLoadState).toHaveBeenCalledWith({ status: 'loading' });
    });
  });

  describe('submitAnswerForQuestion', () => {
    it('submits the answer with the sessionId and sets result on success', async () => {
      const submitAnswerFn = vi.fn(async () =>
        ok({
          attemptId: 'attempt_1',
          isCorrect: true,
          correctChoiceId: 'choice_1',
          explanationMd: 'Because...',
        } satisfies SubmitAnswerOutput),
      );
      const setSubmitResult = vi.fn();

      await submitAnswerForQuestion({
        sessionId: 'session-1',
        question: createNextQuestion(),
        selectedChoiceId: 'choice_1',
        questionLoadedAtMs: 1000,
        submitIdempotencyKey: 'idem_1',
        submitAnswerFn,
        nowMs: () => 5000,
        setLoadState: vi.fn(),
        setSubmitResult,
      });

      expect(submitAnswerFn).toHaveBeenCalledWith({
        questionId: 'q_1',
        choiceId: 'choice_1',
        sessionId: 'session-1',
        idempotencyKey: 'idem_1',
        timeSpentSeconds: 4,
      });
      expect(setSubmitResult).toHaveBeenCalledWith(
        expect.objectContaining({ isCorrect: true }),
      );
    });

    it('does nothing when question is null', async () => {
      const submitAnswerFn = vi.fn(async () =>
        ok({
          attemptId: 'attempt_1',
          isCorrect: true,
          correctChoiceId: 'choice_1',
          explanationMd: 'Because...',
        } satisfies SubmitAnswerOutput),
      );

      const setLoadState = vi.fn();
      const setSubmitResult = vi.fn();

      await submitAnswerForQuestion({
        sessionId: 'session-1',
        question: null,
        selectedChoiceId: 'choice_1',
        questionLoadedAtMs: 0,
        submitIdempotencyKey: 'idem_1',
        submitAnswerFn,
        nowMs: () => 0,
        setLoadState,
        setSubmitResult,
      });

      expect(submitAnswerFn).not.toHaveBeenCalled();
      expect(setLoadState).not.toHaveBeenCalled();
      expect(setSubmitResult).not.toHaveBeenCalled();
    });

    it('does nothing when selectedChoiceId is null', async () => {
      const submitAnswerFn = vi.fn(async () =>
        ok({
          attemptId: 'attempt_1',
          isCorrect: true,
          correctChoiceId: 'choice_1',
          explanationMd: 'Because...',
        } satisfies SubmitAnswerOutput),
      );

      const setLoadState = vi.fn();
      const setSubmitResult = vi.fn();

      await submitAnswerForQuestion({
        sessionId: 'session-1',
        question: createNextQuestion(),
        selectedChoiceId: null,
        questionLoadedAtMs: 0,
        submitIdempotencyKey: 'idem_1',
        submitAnswerFn,
        nowMs: () => 0,
        setLoadState,
        setSubmitResult,
      });

      expect(submitAnswerFn).not.toHaveBeenCalled();
      expect(setLoadState).not.toHaveBeenCalled();
      expect(setSubmitResult).not.toHaveBeenCalled();
    });

    it('sets error state when submit fails', async () => {
      const setLoadState = vi.fn();

      await submitAnswerForQuestion({
        sessionId: 'session-1',
        question: createNextQuestion(),
        selectedChoiceId: 'choice_1',
        questionLoadedAtMs: 0,
        submitIdempotencyKey: 'idem_1',
        submitAnswerFn: async () => err('INTERNAL_ERROR', 'Boom'),
        nowMs: () => 0,
        setLoadState,
        setSubmitResult: vi.fn(),
      });

      expect(setLoadState).toHaveBeenCalledWith({
        status: 'error',
        message: 'Boom',
      });
    });
  });

  describe('endSession', () => {
    it('sets summary and resets state on success', async () => {
      const setSummary = vi.fn();
      const setQuestion = vi.fn();
      const setSubmitResult = vi.fn();
      const setSelectedChoiceId = vi.fn();

      await endSession({
        sessionId: 'session-1',
        endPracticeSessionFn: async () =>
          ok({
            sessionId: 'session-1',
            endedAt: '2026-02-01T00:00:00.000Z',
            totals: {
              answered: 10,
              correct: 7,
              accuracy: 0.7,
              durationSeconds: 123,
            },
          }),
        setLoadState: vi.fn(),
        setSummary,
        setQuestion,
        setSubmitResult,
        setSelectedChoiceId,
      });

      expect(setSummary).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'session-1' }),
      );
      expect(setQuestion).toHaveBeenCalledWith(null);
      expect(setSubmitResult).toHaveBeenCalledWith(null);
      expect(setSelectedChoiceId).toHaveBeenCalledWith(null);
    });

    it('sets error state when controller fails', async () => {
      const setLoadState = vi.fn();

      await endSession({
        sessionId: 'session-1',
        endPracticeSessionFn: async () => err('INTERNAL_ERROR', 'Boom'),
        setLoadState,
        setSummary: vi.fn(),
        setQuestion: vi.fn(),
        setSubmitResult: vi.fn(),
        setSelectedChoiceId: vi.fn(),
      });

      expect(setLoadState).toHaveBeenCalledWith({
        status: 'error',
        message: 'Boom',
      });
    });
  });
});
