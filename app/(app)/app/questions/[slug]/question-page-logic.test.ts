import { describe, expect, it, vi } from 'vitest';
import { err, ok } from '@/src/adapters/controllers/action-result';
import type { GetQuestionBySlugOutput } from '@/src/adapters/controllers/question-view-controller';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import {
  createLoadQuestionAction,
  loadQuestion,
  reattemptQuestion,
  submitSelectedAnswer,
} from './question-page-logic';

function createQuestion(): GetQuestionBySlugOutput {
  return {
    questionId: 'q_1',
    slug: 'q-1',
    stemMd: '#',
    difficulty: 'easy',
    choices: [],
  };
}

describe('question-page-logic', () => {
  describe('loadQuestion', () => {
    it('loads question and resets state on success', async () => {
      const setLoadState = vi.fn();
      const setSelectedChoiceId = vi.fn();
      const setSubmitResult = vi.fn();
      const setSubmitIdempotencyKey = vi.fn();
      const setQuestionLoadedAt = vi.fn();
      const setQuestion = vi.fn();

      await loadQuestion({
        slug: 'q-1',
        getQuestionBySlugFn: async () => ok(createQuestion()),
        createIdempotencyKey: () => 'idem_1',
        nowMs: () => 1234,
        setLoadState,
        setSelectedChoiceId,
        setSubmitResult,
        setSubmitIdempotencyKey,
        setQuestionLoadedAt,
        setQuestion,
      });

      expect(setLoadState).toHaveBeenCalledWith({ status: 'loading' });
      expect(setSelectedChoiceId).toHaveBeenCalledWith(null);
      expect(setSubmitResult).toHaveBeenCalledWith(null);
      expect(setSubmitIdempotencyKey).toHaveBeenCalledWith(null);
      expect(setQuestionLoadedAt).toHaveBeenCalledWith(null);

      expect(setQuestion).toHaveBeenCalledWith(
        expect.objectContaining({ questionId: 'q_1' }),
      );
      expect(setQuestionLoadedAt).toHaveBeenCalledWith(1234);
      expect(setSubmitIdempotencyKey).toHaveBeenLastCalledWith('idem_1');
      expect(setLoadState).toHaveBeenCalledWith({ status: 'ready' });
    });

    it('sets error state and clears question on failure', async () => {
      const setLoadState = vi.fn();
      const setSelectedChoiceId = vi.fn();
      const setSubmitResult = vi.fn();
      const setSubmitIdempotencyKey = vi.fn();
      const setQuestionLoadedAt = vi.fn();
      const setQuestion = vi.fn();

      await loadQuestion({
        slug: 'q-1',
        getQuestionBySlugFn: async () => err('NOT_FOUND', 'Question not found'),
        createIdempotencyKey: () => 'idem_1',
        nowMs: () => 1234,
        setLoadState,
        setSelectedChoiceId,
        setSubmitResult,
        setSubmitIdempotencyKey,
        setQuestionLoadedAt,
        setQuestion,
      });

      expect(setQuestion).toHaveBeenCalledWith(null);
      expect(setLoadState).toHaveBeenCalledWith({
        status: 'error',
        message: 'Question not found',
      });
    });
  });

  describe('createLoadQuestionAction', () => {
    it('runs load inside startTransition', async () => {
      const startTransition = vi.fn((fn: () => void) => fn());
      const setLoadState = vi.fn();

      const action = createLoadQuestionAction({
        slug: 'q-1',
        startTransition,
        getQuestionBySlugFn: async () => ok(createQuestion()),
        createIdempotencyKey: () => 'idem_1',
        nowMs: () => 1234,
        setLoadState,
        setSelectedChoiceId: vi.fn(),
        setSubmitResult: vi.fn(),
        setSubmitIdempotencyKey: vi.fn(),
        setQuestionLoadedAt: vi.fn(),
        setQuestion: vi.fn(),
      });

      action();

      expect(startTransition).toHaveBeenCalledTimes(1);
      expect(setLoadState).toHaveBeenCalledWith({ status: 'loading' });
    });
  });

  describe('submitSelectedAnswer', () => {
    it('does nothing when question is null', async () => {
      const submitAnswerFn = vi.fn(async () =>
        ok({
          attemptId: 'attempt_1',
          isCorrect: true,
          correctChoiceId: 'choice_1',
          explanationMd: 'Because...',
        } satisfies SubmitAnswerOutput),
      );

      await submitSelectedAnswer({
        question: null,
        selectedChoiceId: 'choice_1',
        questionLoadedAtMs: 0,
        submitIdempotencyKey: 'idem_1',
        submitAnswerFn,
        nowMs: () => 1000,
        setLoadState: vi.fn(),
        setSubmitResult: vi.fn(),
      });

      expect(submitAnswerFn).not.toHaveBeenCalled();
    });

    it('submits the selected answer and updates state on success', async () => {
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

      await submitSelectedAnswer({
        question: createQuestion(),
        selectedChoiceId: 'choice_1',
        questionLoadedAtMs: 1000,
        submitIdempotencyKey: 'idem_1',
        submitAnswerFn,
        nowMs: () => 5000,
        setLoadState,
        setSubmitResult,
      });

      expect(submitAnswerFn).toHaveBeenCalledWith({
        questionId: 'q_1',
        choiceId: 'choice_1',
        idempotencyKey: 'idem_1',
        timeSpentSeconds: 4,
      });
      expect(setSubmitResult).toHaveBeenCalledWith(
        expect.objectContaining({ isCorrect: true }),
      );
      expect(setLoadState).toHaveBeenCalledWith({ status: 'ready' });
    });

    it('computes timeSpentSeconds when questionLoadedAtMs is 0', async () => {
      const submitAnswerFn = vi.fn(async () =>
        ok({
          attemptId: 'attempt_1',
          isCorrect: true,
          correctChoiceId: 'choice_1',
          explanationMd: 'Because...',
        } satisfies SubmitAnswerOutput),
      );

      await submitSelectedAnswer({
        question: createQuestion(),
        selectedChoiceId: 'choice_1',
        questionLoadedAtMs: 0,
        submitIdempotencyKey: 'idem_1',
        submitAnswerFn,
        nowMs: () => 1500,
        setLoadState: vi.fn(),
        setSubmitResult: vi.fn(),
      });

      expect(submitAnswerFn).toHaveBeenCalledWith(
        expect.objectContaining({ timeSpentSeconds: 1 }),
      );
    });

    it('clamps timeSpentSeconds to 0 when clock goes backwards', async () => {
      const submitAnswerFn = vi.fn(async () =>
        ok({
          attemptId: 'attempt_1',
          isCorrect: true,
          correctChoiceId: 'choice_1',
          explanationMd: 'Because...',
        } satisfies SubmitAnswerOutput),
      );

      await submitSelectedAnswer({
        question: createQuestion(),
        selectedChoiceId: 'choice_1',
        questionLoadedAtMs: 5000,
        submitIdempotencyKey: 'idem_1',
        submitAnswerFn,
        nowMs: () => 1000,
        setLoadState: vi.fn(),
        setSubmitResult: vi.fn(),
      });

      expect(submitAnswerFn).toHaveBeenCalledWith(
        expect.objectContaining({ timeSpentSeconds: 0 }),
      );
    });

    it('sets error state when submit fails', async () => {
      const submitAnswerFn = vi.fn(async () =>
        err('INTERNAL_ERROR', 'Internal error'),
      );
      const setLoadState = vi.fn();

      await submitSelectedAnswer({
        question: createQuestion(),
        selectedChoiceId: 'choice_1',
        questionLoadedAtMs: null,
        submitIdempotencyKey: 'idem_1',
        submitAnswerFn,
        nowMs: () => 0,
        setLoadState,
        setSubmitResult: vi.fn(),
      });

      expect(setLoadState).toHaveBeenCalledWith({
        status: 'error',
        message: 'Internal error',
      });
    });
  });

  describe('reattemptQuestion', () => {
    it('clears choice/result and resets loadedAt', () => {
      const setSelectedChoiceId = vi.fn();
      const setSubmitResult = vi.fn();
      const setSubmitIdempotencyKey = vi.fn();
      const setQuestionLoadedAt = vi.fn();

      reattemptQuestion({
        createIdempotencyKey: () => 'idem_1',
        nowMs: () => 1234,
        setSelectedChoiceId,
        setSubmitResult,
        setSubmitIdempotencyKey,
        setQuestionLoadedAt,
      });

      expect(setSelectedChoiceId).toHaveBeenCalledWith(null);
      expect(setSubmitResult).toHaveBeenCalledWith(null);
      expect(setSubmitIdempotencyKey).toHaveBeenCalledWith('idem_1');
      expect(setQuestionLoadedAt).toHaveBeenCalledWith(1234);
    });
  });
});
