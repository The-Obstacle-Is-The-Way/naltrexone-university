import { describe, expect, it, vi } from 'vitest';
import {
  createBookmarksEffect,
  createLoadNextQuestionAction,
  handleSessionCountChange,
  handleSessionModeChange,
  loadNextQuestion,
  SESSION_COUNT_MAX,
  SESSION_COUNT_MIN,
  selectChoiceIfAllowed,
  startSession,
  submitAnswerForQuestion,
  toggleBookmarkForQuestion,
} from '@/app/(app)/app/practice/practice-page-logic';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { err, ok } from '@/src/adapters/controllers/action-result';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import { createChoice, createQuestion } from '@/src/domain/test-helpers';

function createNextQuestion(): NextQuestion {
  const questionId = 'q_1';
  const choice = createChoice({
    id: 'choice_1',
    questionId,
    label: 'A',
    textMd: 'Choice A',
    sortOrder: 1,
  });
  const question = createQuestion({
    id: questionId,
    slug: 'q-1',
    stemMd: '#',
    difficulty: 'easy',
    choices: [choice],
  });

  return {
    questionId: question.id,
    slug: question.slug,
    stemMd: question.stemMd,
    difficulty: question.difficulty,
    choices: question.choices.map((c, index) => ({
      id: c.id,
      label: c.label,
      textMd: c.textMd,
      sortOrder: index + 1,
    })),
    session: null,
  };
}

describe('practice-page-logic', () => {
  describe('loadNextQuestion', () => {
    it('loads next question and updates loadedAt when a question exists', async () => {
      const getNextQuestionFn = vi.fn(async () => ok(createNextQuestion()));
      const setLoadState = vi.fn();
      const setSelectedChoiceId = vi.fn();
      const setSubmitResult = vi.fn();
      const setSubmitIdempotencyKey = vi.fn();
      const setQuestionLoadedAt = vi.fn();
      const setQuestion = vi.fn();

      await loadNextQuestion({
        getNextQuestionFn,
        filters: { tagSlugs: ['opioids'], difficulties: ['easy'] },
        createIdempotencyKey: () => 'idem_1',
        nowMs: () => 1234,
        setLoadState,
        setSelectedChoiceId,
        setSubmitResult,
        setSubmitIdempotencyKey,
        setQuestionLoadedAt,
        setQuestion,
      });

      expect(getNextQuestionFn).toHaveBeenCalledWith({
        filters: { tagSlugs: ['opioids'], difficulties: ['easy'] },
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

    it('sets loadedAt to null when there is no next question', async () => {
      const setQuestionLoadedAt = vi.fn();
      const setSubmitIdempotencyKey = vi.fn();

      await loadNextQuestion({
        getNextQuestionFn: async () => ok(null),
        filters: { tagSlugs: [], difficulties: [] },
        createIdempotencyKey: () => 'idem_1',
        nowMs: () => 1234,
        setLoadState: vi.fn(),
        setSelectedChoiceId: vi.fn(),
        setSubmitResult: vi.fn(),
        setSubmitIdempotencyKey,
        setQuestionLoadedAt,
        setQuestion: vi.fn(),
      });

      expect(setQuestionLoadedAt).toHaveBeenCalledWith(null);
      expect(setSubmitIdempotencyKey).toHaveBeenLastCalledWith(null);
    });

    it('sets error state when controller fails', async () => {
      const setLoadState = vi.fn();
      const setQuestion = vi.fn();
      const setSubmitIdempotencyKey = vi.fn();

      await loadNextQuestion({
        getNextQuestionFn: async () =>
          err('UNSUBSCRIBED', 'Subscription required'),
        filters: { tagSlugs: [], difficulties: [] },
        createIdempotencyKey: () => 'idem_1',
        nowMs: () => 1234,
        setLoadState,
        setSelectedChoiceId: vi.fn(),
        setSubmitResult: vi.fn(),
        setSubmitIdempotencyKey,
        setQuestionLoadedAt: vi.fn(),
        setQuestion,
      });

      expect(setQuestion).toHaveBeenCalledWith(null);
      expect(setSubmitIdempotencyKey).toHaveBeenLastCalledWith(null);
      expect(setLoadState).toHaveBeenCalledWith({
        status: 'error',
        message: 'Subscription required',
      });
    });
  });

  describe('createLoadNextQuestionAction', () => {
    it('runs load inside startTransition', () => {
      const startTransition = vi.fn((fn: () => void) => fn());
      const setLoadState = vi.fn();

      const action = createLoadNextQuestionAction({
        startTransition,
        getNextQuestionFn: async () => ok(createNextQuestion()),
        filters: { tagSlugs: [], difficulties: [] },
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

  describe('createBookmarksEffect', () => {
    it('loads bookmarks and updates state on success', async () => {
      const setBookmarkedQuestionIds = vi.fn();
      const setBookmarkStatus = vi.fn();

      const cleanup = createBookmarksEffect({
        bookmarkRetryCount: 0,
        getBookmarksFn: async () =>
          ok({ rows: [{ questionId: 'q_1' }, { questionId: 'q_2' }] }),
        setBookmarkedQuestionIds,
        setBookmarkStatus,
        setBookmarkRetryCount: vi.fn(),
      });

      await Promise.resolve();

      expect(setBookmarkedQuestionIds).toHaveBeenCalledWith(
        new Set(['q_1', 'q_2']),
      );
      expect(setBookmarkStatus).toHaveBeenCalledWith('idle');

      cleanup();
    });

    it('retries when bookmarks load fails and retryCount < 2', async () => {
      vi.useFakeTimers();
      try {
        let retry = 0;
        const setBookmarkRetryCount = vi.fn(
          (next: number | ((prev: number) => number)) => {
            retry = typeof next === 'function' ? next(retry) : next;
          },
        );

        const setTimeoutFn = vi.fn((fn: () => void, ms: number) =>
          setTimeout(fn, ms),
        );
        const clearTimeoutFn = vi.fn((id: ReturnType<typeof setTimeout>) =>
          clearTimeout(id),
        );

        const cleanup = createBookmarksEffect({
          bookmarkRetryCount: 0,
          getBookmarksFn: async () => err('INTERNAL_ERROR', 'Boom'),
          setBookmarkedQuestionIds: vi.fn(),
          setBookmarkStatus: vi.fn(),
          setBookmarkRetryCount,
          setTimeoutFn,
          clearTimeoutFn,
          logError: vi.fn(),
        });

        await Promise.resolve();

        expect(setTimeoutFn).toHaveBeenCalledWith(expect.any(Function), 1000);

        await vi.advanceTimersByTimeAsync(1000);
        expect(retry).toBe(1);

        cleanup();
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not retry when retryCount >= 2', async () => {
      const setTimeoutFn = vi.fn((fn: () => void, ms: number) =>
        setTimeout(fn, ms),
      );

      const cleanup = createBookmarksEffect({
        bookmarkRetryCount: 2,
        getBookmarksFn: async () => err('INTERNAL_ERROR', 'Boom'),
        setBookmarkedQuestionIds: vi.fn(),
        setBookmarkStatus: vi.fn(),
        setBookmarkRetryCount: vi.fn(),
        setTimeoutFn,
        clearTimeoutFn: vi.fn(),
        logError: vi.fn(),
      });

      await Promise.resolve();
      expect(setTimeoutFn).not.toHaveBeenCalled();

      cleanup();
    });

    it('clears any scheduled timeout on cleanup', async () => {
      vi.useFakeTimers();
      try {
        const setTimeoutFn = vi.fn((fn: () => void, ms: number) =>
          setTimeout(fn, ms),
        );
        const clearTimeoutFn = vi.fn((id: ReturnType<typeof setTimeout>) =>
          clearTimeout(id),
        );

        const cleanup = createBookmarksEffect({
          bookmarkRetryCount: 0,
          getBookmarksFn: async () => err('INTERNAL_ERROR', 'Boom'),
          setBookmarkedQuestionIds: vi.fn(),
          setBookmarkStatus: vi.fn(),
          setBookmarkRetryCount: vi.fn(),
          setTimeoutFn,
          clearTimeoutFn,
          logError: vi.fn(),
        });

        await Promise.resolve();
        cleanup();

        expect(clearTimeoutFn).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('logs via console.error when bookmarks load fails and no logError is provided', async () => {
      vi.useFakeTimers();
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {
        // swallow expected error logs
      });

      try {
        const setBookmarkStatus = vi.fn();

        const cleanup = createBookmarksEffect({
          bookmarkRetryCount: 0,
          getBookmarksFn: async () => err('INTERNAL_ERROR', 'Boom'),
          setBookmarkedQuestionIds: vi.fn(),
          setBookmarkStatus,
          setBookmarkRetryCount: vi.fn(),
        });

        await Promise.resolve();

        expect(consoleError).toHaveBeenCalledWith('Failed to load bookmarks', {
          code: 'INTERNAL_ERROR',
          message: 'Boom',
        });
        expect(setBookmarkStatus).toHaveBeenCalledWith('error');

        cleanup();
      } finally {
        consoleError.mockRestore();
        vi.useRealTimers();
      }
    });

    it('does not update state after cleanup', async () => {
      const setBookmarkedQuestionIds = vi.fn();
      const setBookmarkStatus = vi.fn();

      let resolveBookmarks:
        | ((
            value: ActionResult<{ rows: Array<{ questionId: string }> }>,
          ) => void)
        | undefined;
      const pending = new Promise<
        ActionResult<{ rows: Array<{ questionId: string }> }>
      >((res) => {
        resolveBookmarks = res;
      });
      if (!resolveBookmarks) throw new Error('Expected resolve function');

      const getBookmarksFn = vi.fn(async () => pending);

      const cleanup = createBookmarksEffect({
        bookmarkRetryCount: 0,
        getBookmarksFn,
        setBookmarkedQuestionIds,
        setBookmarkStatus,
        setBookmarkRetryCount: vi.fn(),
      });

      cleanup();
      resolveBookmarks(
        ok({
          rows: [{ questionId: 'q_1' }],
        }),
      );

      await Promise.resolve();

      expect(setBookmarkedQuestionIds).not.toHaveBeenCalled();
      expect(setBookmarkStatus).not.toHaveBeenCalled();
    });
  });

  describe('submitAnswerForQuestion', () => {
    it('submits answer and sets result on success', async () => {
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
        question: createNextQuestion(),
        selectedChoiceId: 'choice_1',
        questionLoadedAtMs: 1000,
        submitIdempotencyKey: 'idem_1',
        submitAnswerFn,
        nowMs: () => 6000,
        setLoadState: vi.fn(),
        setSubmitResult,
      });

      expect(submitAnswerFn).toHaveBeenCalledWith({
        questionId: 'q_1',
        choiceId: 'choice_1',
        idempotencyKey: 'idem_1',
        timeSpentSeconds: 5,
      });
      expect(setSubmitResult).toHaveBeenCalledWith(
        expect.objectContaining({ isCorrect: true }),
      );
    });

    it('defaults timeSpentSeconds to 0 when loadedAt is null', async () => {
      const submitAnswerFn = vi.fn(async () =>
        ok({
          attemptId: 'attempt_1',
          isCorrect: true,
          correctChoiceId: 'choice_1',
          explanationMd: 'Because...',
        } satisfies SubmitAnswerOutput),
      );

      await submitAnswerForQuestion({
        question: createNextQuestion(),
        selectedChoiceId: 'choice_1',
        questionLoadedAtMs: null,
        submitIdempotencyKey: 'idem_1',
        submitAnswerFn,
        nowMs: () => 0,
        setLoadState: vi.fn(),
        setSubmitResult: vi.fn(),
      });

      expect(submitAnswerFn).toHaveBeenCalledWith(
        expect.objectContaining({ timeSpentSeconds: 0 }),
      );
    });

    it('computes timeSpentSeconds when loadedAt is 0', async () => {
      const submitAnswerFn = vi.fn(async () =>
        ok({
          attemptId: 'attempt_1',
          isCorrect: true,
          correctChoiceId: 'choice_1',
          explanationMd: 'Because...',
        } satisfies SubmitAnswerOutput),
      );

      await submitAnswerForQuestion({
        question: createNextQuestion(),
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

    it('sets error state when submit fails', async () => {
      const setLoadState = vi.fn();

      await submitAnswerForQuestion({
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

  describe('toggleBookmarkForQuestion', () => {
    it('toggles bookmark and updates IDs on success', async () => {
      let ids = new Set<string>(['other']);
      const setBookmarkedQuestionIds = vi.fn(
        (next: Set<string> | ((prev: Set<string>) => Set<string>)) => {
          ids = typeof next === 'function' ? next(ids) : next;
        },
      );
      const onBookmarkToggled = vi.fn();

      await toggleBookmarkForQuestion({
        question: createNextQuestion(),
        toggleBookmarkFn: async () => ok({ bookmarked: true }),
        setBookmarkStatus: vi.fn(),
        setLoadState: vi.fn(),
        setBookmarkedQuestionIds,
        onBookmarkToggled,
      });

      expect(ids.has('q_1')).toBe(true);
      expect(onBookmarkToggled).toHaveBeenCalledWith(true);
    });

    it('sets error state when toggle fails', async () => {
      const setLoadState = vi.fn();
      const setBookmarkStatus = vi.fn();
      const onBookmarkToggled = vi.fn();

      await toggleBookmarkForQuestion({
        question: createNextQuestion(),
        toggleBookmarkFn: async () => err('INTERNAL_ERROR', 'Boom'),
        setBookmarkStatus,
        setLoadState,
        setBookmarkedQuestionIds: vi.fn(),
        onBookmarkToggled,
      });

      expect(setBookmarkStatus).toHaveBeenCalledWith('error');
      expect(setLoadState).not.toHaveBeenCalled();
      expect(onBookmarkToggled).not.toHaveBeenCalled();
    });

    it('removes the question id when bookmark is removed', async () => {
      let ids = new Set<string>(['q_1', 'other']);

      const setBookmarkedQuestionIds = vi.fn(
        (next: Set<string> | ((prev: Set<string>) => Set<string>)) => {
          ids = typeof next === 'function' ? next(ids) : next;
        },
      );

      const setBookmarkStatus = vi.fn();
      const onBookmarkToggled = vi.fn();

      await toggleBookmarkForQuestion({
        question: createNextQuestion(),
        toggleBookmarkFn: async () => ok({ bookmarked: false }),
        setBookmarkStatus,
        setLoadState: vi.fn(),
        setBookmarkedQuestionIds,
        onBookmarkToggled,
      });

      expect(ids.has('q_1')).toBe(false);
      expect(onBookmarkToggled).toHaveBeenCalledWith(false);
      expect(setBookmarkStatus).toHaveBeenLastCalledWith('idle');
    });
  });

  describe('selectChoiceIfAllowed', () => {
    it('does nothing when submitResult exists', () => {
      const setSelectedChoiceId = vi.fn();

      selectChoiceIfAllowed(
        {
          attemptId: 'attempt_1',
          isCorrect: true,
          correctChoiceId: 'choice_1',
          explanationMd: 'Because...',
        },
        setSelectedChoiceId,
        'choice_1',
      );

      expect(setSelectedChoiceId).not.toHaveBeenCalled();
    });

    it('sets the choice when no submitResult exists', () => {
      const setSelectedChoiceId = vi.fn();

      selectChoiceIfAllowed(null, setSelectedChoiceId, 'choice_1');

      expect(setSelectedChoiceId).toHaveBeenCalledWith('choice_1');
    });
  });

  describe('handleSessionModeChange', () => {
    it('sets mode only for allowed values', () => {
      const setSessionMode = vi.fn();

      handleSessionModeChange(setSessionMode, { target: { value: 'tutor' } });
      handleSessionModeChange(setSessionMode, { target: { value: 'exam' } });
      handleSessionModeChange(setSessionMode, { target: { value: 'nope' } });

      expect(setSessionMode).toHaveBeenCalledTimes(2);
      expect(setSessionMode).toHaveBeenNthCalledWith(1, 'tutor');
      expect(setSessionMode).toHaveBeenNthCalledWith(2, 'exam');
    });
  });

  describe('handleSessionCountChange', () => {
    it('sets the count from numeric input', () => {
      const setSessionCount = vi.fn();

      handleSessionCountChange(setSessionCount, { target: { value: '12' } });

      expect(setSessionCount).toHaveBeenCalledWith(12);
    });

    it('clamps to minimum when value is below range or not finite', () => {
      const setSessionCount = vi.fn();

      handleSessionCountChange(setSessionCount, { target: { value: '0' } });
      handleSessionCountChange(setSessionCount, { target: { value: '-1' } });
      handleSessionCountChange(setSessionCount, { target: { value: 'NaN' } });

      expect(setSessionCount).toHaveBeenLastCalledWith(SESSION_COUNT_MIN);
    });

    it('clamps to maximum when value is above range', () => {
      const setSessionCount = vi.fn();

      handleSessionCountChange(setSessionCount, { target: { value: '101' } });

      expect(setSessionCount).toHaveBeenCalledWith(SESSION_COUNT_MAX);
    });
  });

  describe('startSession', () => {
    it('sets error state when controller fails', async () => {
      const setSessionStartStatus = vi.fn();
      const setSessionStartError = vi.fn();
      const setIdempotencyKey = vi.fn();

      await startSession({
        sessionMode: 'tutor',
        sessionCount: 20,
        filters: { tagSlugs: ['alcohol'], difficulties: [] },
        idempotencyKey: 'idem_1',
        createIdempotencyKey: () => 'idem_2',
        setIdempotencyKey,
        startPracticeSessionFn: async () => err('NOT_FOUND', 'No questions'),
        setSessionStartStatus,
        setSessionStartError,
        navigateTo: vi.fn(),
      });

      expect(setSessionStartStatus).toHaveBeenCalledWith('error');
      expect(setSessionStartError).toHaveBeenCalledWith('No questions');
      expect(setIdempotencyKey).toHaveBeenCalledWith('idem_2');
    });

    it('navigates to the session route on success', async () => {
      const startPracticeSessionFn = vi.fn(async () =>
        ok({ sessionId: 'session-1' }),
      );
      const navigateTo = vi.fn();
      const setIdempotencyKey = vi.fn();

      await startSession({
        sessionMode: 'exam',
        sessionCount: 10,
        filters: { tagSlugs: ['opioids'], difficulties: ['hard'] },
        idempotencyKey: 'idem_1',
        createIdempotencyKey: () => 'idem_2',
        setIdempotencyKey,
        startPracticeSessionFn,
        setSessionStartStatus: vi.fn(),
        setSessionStartError: vi.fn(),
        navigateTo,
      });

      expect(startPracticeSessionFn).toHaveBeenCalledWith({
        mode: 'exam',
        count: 10,
        idempotencyKey: 'idem_1',
        tagSlugs: ['opioids'],
        difficulties: ['hard'],
      });
      expect(navigateTo).toHaveBeenCalledWith('/app/practice/session-1');
      expect(setIdempotencyKey).not.toHaveBeenCalled();
    });
  });
});
