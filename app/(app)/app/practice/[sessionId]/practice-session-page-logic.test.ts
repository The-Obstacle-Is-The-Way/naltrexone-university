import { describe, expect, it, vi } from 'vitest';
import {
  createLoadNextQuestionAction,
  createNavigatorEffect,
  createSummaryReviewEffect,
  endSession,
  loadNextQuestion,
  maybeAutoAdvanceAfterSubmit,
  submitAnswerForQuestion,
} from '@/app/(app)/app/practice/[sessionId]/practice-session-page-logic';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { err, ok } from '@/src/adapters/controllers/action-result';
import type {
  EndPracticeSessionOutput,
  GetPracticeSessionReviewOutput,
} from '@/src/adapters/controllers/practice-controller';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import { createDeferred } from '@/tests/test-helpers/create-deferred';

describe('practice-session-page-logic', () => {
  describe('loadNextQuestion', () => {
    it('ignores stale responses when a newer request finishes first', async () => {
      const first = createDeferred<ActionResult<NextQuestion | null>>();
      const second = createDeferred<ActionResult<NextQuestion | null>>();
      let latestRequestId = 0;
      const responseQueue = [first.promise, second.promise];

      const getNextQuestionFn = vi.fn(async () => {
        const nextResponse = responseQueue.shift();
        if (!nextResponse) {
          throw new Error('Unexpected call to getNextQuestionFn');
        }
        return nextResponse;
      });

      const setQuestion = vi.fn();
      const setSessionInfo = vi.fn();
      const setLoadState = vi.fn();

      const createRequestSequenceId = () => {
        latestRequestId += 1;
        return latestRequestId;
      };
      const isLatestRequest = (requestId: number) =>
        requestId === latestRequestId;

      const loadFirst = loadNextQuestion({
        sessionId: 'session-1',
        getNextQuestionFn,
        createIdempotencyKey: () => 'idem_1',
        nowMs: () => 1234,
        setLoadState,
        setSelectedChoiceId: vi.fn(),
        setSubmitResult: vi.fn(),
        setSubmitIdempotencyKey: vi.fn(),
        setQuestionLoadedAt: vi.fn(),
        setQuestion,
        setSessionInfo,
        createRequestSequenceId,
        isLatestRequest,
      });

      const loadSecond = loadNextQuestion({
        sessionId: 'session-1',
        getNextQuestionFn,
        createIdempotencyKey: () => 'idem_2',
        nowMs: () => 5678,
        setLoadState,
        setSelectedChoiceId: vi.fn(),
        setSubmitResult: vi.fn(),
        setSubmitIdempotencyKey: vi.fn(),
        setQuestionLoadedAt: vi.fn(),
        setQuestion,
        setSessionInfo,
        createRequestSequenceId,
        isLatestRequest,
      });

      second.resolve(
        ok(
          createNextQuestion({
            questionId: 'q_2',
            slug: 'q-2',
            session: {
              sessionId: 'session-1',
              mode: 'tutor',
              index: 1,
              total: 2,
            },
          }),
        ),
      );
      await loadSecond;

      first.resolve(
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
      );
      await loadFirst;

      expect(setQuestion).toHaveBeenCalledTimes(1);
      expect(setQuestion).toHaveBeenCalledWith(
        expect.objectContaining({ questionId: 'q_2' }),
      );
      expect(setSessionInfo.mock.calls.at(-1)?.[0]).toEqual(
        expect.objectContaining({ index: 1 }),
      );
      expect(setLoadState.mock.calls.at(-1)?.[0]).toEqual({ status: 'ready' });
    });

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

    it('forwards questionId when loading a specific session question', async () => {
      const getNextQuestionFn = vi.fn(async () => ok(createNextQuestion()));

      await loadNextQuestion({
        sessionId: 'session-1',
        questionId: 'question-9',
        getNextQuestionFn,
        createIdempotencyKey: () => 'idem_1',
        nowMs: () => 1234,
        setLoadState: vi.fn(),
        setSelectedChoiceId: vi.fn(),
        setSubmitResult: vi.fn(),
        setSubmitIdempotencyKey: vi.fn(),
        setQuestionLoadedAt: vi.fn(),
        setQuestion: vi.fn(),
        setSessionInfo: vi.fn(),
      });

      expect(getNextQuestionFn).toHaveBeenCalledWith({
        sessionId: 'session-1',
        questionId: 'question-9',
      });
    });

    it('forwards fromIndex when advancing sequentially', async () => {
      const getNextQuestionFn = vi.fn(async () => ok(createNextQuestion()));

      await loadNextQuestion({
        sessionId: 'session-1',
        fromIndex: 4,
        getNextQuestionFn,
        createIdempotencyKey: () => 'idem_1',
        nowMs: () => 1234,
        setLoadState: vi.fn(),
        setSelectedChoiceId: vi.fn(),
        setSubmitResult: vi.fn(),
        setSubmitIdempotencyKey: vi.fn(),
        setQuestionLoadedAt: vi.fn(),
        setQuestion: vi.fn(),
        setSessionInfo: vi.fn(),
      });

      expect(getNextQuestionFn).toHaveBeenCalledWith({
        sessionId: 'session-1',
        fromIndex: 4,
      });
    });

    it('preserves sessionInfo when no next question is returned', async () => {
      const setSubmitIdempotencyKey = vi.fn();
      const setQuestionLoadedAt = vi.fn();
      const setQuestion = vi.fn();
      const setSessionInfo = vi.fn();

      await loadNextQuestion({
        sessionId: 'session-1',
        getNextQuestionFn: async () => ok(null),
        createIdempotencyKey: () => 'idem_1',
        nowMs: () => 1234,
        setLoadState: vi.fn(),
        setSelectedChoiceId: vi.fn(),
        setSubmitResult: vi.fn(),
        setSubmitIdempotencyKey,
        setQuestionLoadedAt,
        setQuestion,
        setSessionInfo,
      });

      expect(setQuestion).toHaveBeenCalledWith(null);
      expect(setQuestionLoadedAt).toHaveBeenLastCalledWith(null);
      expect(setSubmitIdempotencyKey).toHaveBeenLastCalledWith(null);
      expect(setSessionInfo).not.toHaveBeenCalled();
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

    it('sets error state when controller throws', async () => {
      const setLoadState = vi.fn();
      const setQuestionLoadedAt = vi.fn();
      const setSubmitIdempotencyKey = vi.fn();
      const setQuestion = vi.fn();

      await loadNextQuestion({
        sessionId: 'session-1',
        getNextQuestionFn: async () => {
          throw new Error('Boom');
        },
        createIdempotencyKey: () => 'idem_1',
        nowMs: () => 0,
        setLoadState,
        setSelectedChoiceId: vi.fn(),
        setSubmitResult: vi.fn(),
        setSubmitIdempotencyKey,
        setQuestionLoadedAt,
        setQuestion,
        setSessionInfo: vi.fn(),
      });

      expect(setQuestion).toHaveBeenCalledWith(null);
      expect(setQuestionLoadedAt).toHaveBeenLastCalledWith(null);
      expect(setSubmitIdempotencyKey).toHaveBeenLastCalledWith(null);
      expect(setLoadState).toHaveBeenCalledWith({
        status: 'error',
        message: 'Boom',
      });
    });

    it('returns no state updates when unmounted during loadNextQuestion', async () => {
      const deferred = createDeferred<ActionResult<NextQuestion | null>>();
      let mounted = true;

      const setLoadState = vi.fn();
      const setQuestionLoadedAt = vi.fn();
      const setSubmitIdempotencyKey = vi.fn();
      const setQuestion = vi.fn();
      const setSessionInfo = vi.fn();

      const promise = loadNextQuestion({
        sessionId: 'session-1',
        getNextQuestionFn: async () => deferred.promise,
        createIdempotencyKey: () => 'idem_1',
        nowMs: () => 1234,
        setLoadState,
        setSelectedChoiceId: vi.fn(),
        setSubmitResult: vi.fn(),
        setSubmitIdempotencyKey,
        setQuestionLoadedAt,
        setQuestion,
        setSessionInfo,
        isMounted: () => mounted,
      });

      mounted = false;
      deferred.resolve(ok(createNextQuestion()));
      await promise;

      expect(setQuestion).not.toHaveBeenCalled();
      expect(setQuestionLoadedAt).not.toHaveBeenCalledWith(1234);
      expect(setSubmitIdempotencyKey).not.toHaveBeenCalledWith('idem_1');
      expect(setSessionInfo).not.toHaveBeenCalled();
      expect(setLoadState).not.toHaveBeenCalledWith({ status: 'ready' });
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
          choiceExplanations: [],
        } satisfies SubmitAnswerOutput),
      );
      const setLoadState = vi.fn();
      const setSubmitResult = vi.fn();

      await submitAnswerForQuestion({
        sessionId: 'session-1',
        question: createNextQuestion(),
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
        sessionId: 'session-1',
        idempotencyKey: 'idem_1',
        timeSpentSeconds: 4,
      });
      expect(setSubmitResult).toHaveBeenCalledWith(
        expect.objectContaining({ isCorrect: true }),
        'q_1',
      );
      expect(setLoadState).toHaveBeenCalledWith({ status: 'ready' });
    });

    it('does nothing when question is null', async () => {
      const submitAnswerFn = vi.fn(async () =>
        ok({
          attemptId: 'attempt_1',
          isCorrect: true,
          correctChoiceId: 'choice_1',
          explanationMd: 'Because...',
          choiceExplanations: [],
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
          choiceExplanations: [],
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

    it('sets error state when submit throws', async () => {
      const setLoadState = vi.fn();

      await submitAnswerForQuestion({
        sessionId: 'session-1',
        question: createNextQuestion(),
        selectedChoiceId: 'choice_1',
        questionLoadedAtMs: 0,
        submitIdempotencyKey: 'idem_1',
        submitAnswerFn: async () => {
          throw new Error('Boom');
        },
        nowMs: () => 0,
        setLoadState,
        setSubmitResult: vi.fn(),
      });

      expect(setLoadState).toHaveBeenCalledWith({
        status: 'error',
        message: 'Boom',
      });
    });

    it('returns no state updates when unmounted during submitAnswerForQuestion', async () => {
      const deferred = createDeferred<ActionResult<SubmitAnswerOutput>>();
      let mounted = true;

      const setLoadState = vi.fn();
      const setSubmitResult = vi.fn();

      const promise = submitAnswerForQuestion({
        sessionId: 'session-1',
        question: createNextQuestion(),
        selectedChoiceId: 'choice_1',
        questionLoadedAtMs: 0,
        submitIdempotencyKey: 'idem_1',
        submitAnswerFn: async () => deferred.promise,
        nowMs: () => 0,
        setLoadState,
        setSubmitResult,
        isMounted: () => mounted,
      });

      mounted = false;
      deferred.resolve(
        ok({
          attemptId: 'attempt_1',
          isCorrect: true,
          correctChoiceId: 'choice_1',
          explanationMd: 'Because...',
          choiceExplanations: [],
        } satisfies SubmitAnswerOutput),
      );
      await promise;

      expect(setSubmitResult).not.toHaveBeenCalled();
      expect(setLoadState).not.toHaveBeenCalledWith({ status: 'ready' });
    });
  });

  describe('maybeAutoAdvanceAfterSubmit', () => {
    it('returns advance invocation when mode is exam and submitResult exists', () => {
      const advance = vi.fn();

      maybeAutoAdvanceAfterSubmit({
        mode: 'exam',
        submitResult: {
          attemptId: 'attempt_1',
          isCorrect: true,
          correctChoiceId: 'choice_1',
          explanationMd: null,
          choiceExplanations: [],
        },
        loadStateStatus: 'ready',
        sessionInfo: {
          sessionId: 'session-1',
          mode: 'exam',
          index: 0,
          total: 2,
        },
        advance,
      });

      expect(advance).toHaveBeenCalledTimes(1);
    });

    it('returns no advance invocation when current question is the last question', () => {
      const advance = vi.fn();

      maybeAutoAdvanceAfterSubmit({
        mode: 'exam',
        submitResult: {
          attemptId: 'attempt_1',
          isCorrect: true,
          correctChoiceId: 'choice_1',
          explanationMd: null,
          choiceExplanations: [],
        },
        loadStateStatus: 'ready',
        sessionInfo: {
          sessionId: 'session-1',
          mode: 'exam',
          index: 1,
          total: 2,
        },
        advance,
      });

      expect(advance).not.toHaveBeenCalled();
    });

    it('returns no advance invocation for a single-question session', () => {
      const advance = vi.fn();

      maybeAutoAdvanceAfterSubmit({
        mode: 'exam',
        submitResult: {
          attemptId: 'attempt_1',
          isCorrect: true,
          correctChoiceId: 'choice_1',
          explanationMd: null,
          choiceExplanations: [],
        },
        loadStateStatus: 'ready',
        sessionInfo: {
          sessionId: 'session-1',
          mode: 'exam',
          index: 0,
          total: 1,
        },
        advance,
      });

      expect(advance).not.toHaveBeenCalled();
    });

    it('returns no advance invocation when mode is tutor', () => {
      const advance = vi.fn();

      maybeAutoAdvanceAfterSubmit({
        mode: 'tutor',
        submitResult: {
          attemptId: 'attempt_1',
          isCorrect: true,
          correctChoiceId: 'choice_1',
          explanationMd: null,
          choiceExplanations: [],
        },
        loadStateStatus: 'ready',
        sessionInfo: {
          sessionId: 'session-1',
          mode: 'tutor',
          index: 0,
          total: 2,
        },
        advance,
      });

      expect(advance).not.toHaveBeenCalled();
    });

    it('returns no advance invocation when submitResult is null', () => {
      const advance = vi.fn();

      maybeAutoAdvanceAfterSubmit({
        mode: 'exam',
        submitResult: null,
        loadStateStatus: 'ready',
        sessionInfo: {
          sessionId: 'session-1',
          mode: 'exam',
          index: 0,
          total: 2,
        },
        advance,
      });

      expect(advance).not.toHaveBeenCalled();
    });

    it('returns no advance invocation when loadState is loading', () => {
      const advance = vi.fn();

      maybeAutoAdvanceAfterSubmit({
        mode: 'exam',
        submitResult: {
          attemptId: 'attempt_1',
          isCorrect: true,
          correctChoiceId: 'choice_1',
          explanationMd: null,
          choiceExplanations: [],
        },
        loadStateStatus: 'loading',
        sessionInfo: {
          sessionId: 'session-1',
          mode: 'exam',
          index: 0,
          total: 2,
        },
        advance,
      });

      expect(advance).not.toHaveBeenCalled();
    });

    it('returns no advance invocation when mode is null', () => {
      const advance = vi.fn();

      maybeAutoAdvanceAfterSubmit({
        mode: null,
        submitResult: {
          attemptId: 'attempt_1',
          isCorrect: true,
          correctChoiceId: 'choice_1',
          explanationMd: null,
          choiceExplanations: [],
        },
        loadStateStatus: 'ready',
        sessionInfo: null,
        advance,
      });

      expect(advance).not.toHaveBeenCalled();
    });
  });

  describe('endSession', () => {
    const successfulEndSessionOutput: EndPracticeSessionOutput = {
      sessionId: 'session-1',
      endedAt: '2026-02-01T00:00:00.000Z',
      totals: {
        answered: 10,
        correct: 7,
        accuracy: 0.7,
        durationSeconds: 123,
      },
    };

    it('sets summary and resets state on success', async () => {
      const setSummary = vi.fn();
      const resetQuestionState = vi.fn();
      const endPracticeSessionFn = vi.fn(async () =>
        ok(successfulEndSessionOutput),
      );

      await endSession({
        sessionId: 'session-1',
        endSessionIdempotencyKey: 'idem_1',
        endPracticeSessionFn,
        setLoadState: vi.fn(),
        setSummary,
        resetQuestionState,
      });

      expect(endPracticeSessionFn).toHaveBeenCalledWith({
        sessionId: 'session-1',
        idempotencyKey: 'idem_1',
      });
      expect(setSummary).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'session-1' }),
      );
      expect(resetQuestionState).toHaveBeenCalledTimes(1);
    });

    it('sets error state when controller fails', async () => {
      const setLoadState = vi.fn();

      await endSession({
        sessionId: 'session-1',
        endSessionIdempotencyKey: 'idem_1',
        endPracticeSessionFn: async () => err('INTERNAL_ERROR', 'Boom'),
        setLoadState,
        setSummary: vi.fn(),
        resetQuestionState: vi.fn(),
      });

      expect(setLoadState).toHaveBeenCalledWith({
        status: 'error',
        message: 'Boom',
      });
    });

    it('calls rotateIdempotencyKey when controller fails', async () => {
      const rotateIdempotencyKey = vi.fn();

      await endSession({
        sessionId: 'session-1',
        endSessionIdempotencyKey: 'idem_1',
        endPracticeSessionFn: async () => err('INTERNAL_ERROR', 'Boom'),
        setLoadState: vi.fn(),
        setSummary: vi.fn(),
        resetQuestionState: vi.fn(),
        rotateIdempotencyKey,
      });

      expect(rotateIdempotencyKey).toHaveBeenCalledTimes(1);
    });

    it('sets error state when controller throws', async () => {
      const setLoadState = vi.fn();

      await endSession({
        sessionId: 'session-1',
        endSessionIdempotencyKey: 'idem_1',
        endPracticeSessionFn: async () => {
          throw new Error('Boom');
        },
        setLoadState,
        setSummary: vi.fn(),
        resetQuestionState: vi.fn(),
      });

      expect(setLoadState).toHaveBeenCalledWith({
        status: 'error',
        message: 'Boom',
      });
    });

    it('calls rotateIdempotencyKey when controller throws', async () => {
      const rotateIdempotencyKey = vi.fn();

      await endSession({
        sessionId: 'session-1',
        endSessionIdempotencyKey: 'idem_1',
        endPracticeSessionFn: async () => {
          throw new Error('Boom');
        },
        setLoadState: vi.fn(),
        setSummary: vi.fn(),
        resetQuestionState: vi.fn(),
        rotateIdempotencyKey,
      });

      expect(rotateIdempotencyKey).toHaveBeenCalledTimes(1);
    });

    it('does not call rotateIdempotencyKey on success', async () => {
      const rotateIdempotencyKey = vi.fn();

      await endSession({
        sessionId: 'session-1',
        endSessionIdempotencyKey: 'idem_1',
        endPracticeSessionFn: async () => ok(successfulEndSessionOutput),
        setLoadState: vi.fn(),
        setSummary: vi.fn(),
        resetQuestionState: vi.fn(),
        rotateIdempotencyKey,
      });

      expect(rotateIdempotencyKey).not.toHaveBeenCalled();
    });

    it('returns no state updates when unmounted during endSession', async () => {
      const deferred = createDeferred<ActionResult<EndPracticeSessionOutput>>();
      let mounted = true;

      const setLoadState = vi.fn();
      const setSummary = vi.fn();

      const promise = endSession({
        sessionId: 'session-1',
        endSessionIdempotencyKey: 'idem_1',
        endPracticeSessionFn: async () => deferred.promise,
        setLoadState,
        setSummary,
        resetQuestionState: vi.fn(),
        isMounted: () => mounted,
      });

      mounted = false;
      deferred.resolve(
        ok({
          sessionId: 'session-1',
          endedAt: '2026-02-01T00:00:00.000Z',
          totals: { answered: 1, correct: 1, accuracy: 1, durationSeconds: 1 },
        }),
      );
      await promise;

      expect(setSummary).not.toHaveBeenCalled();
      expect(setLoadState).not.toHaveBeenCalledWith({ status: 'ready' });
    });
  });
});

describe('practice-session-page-logic effects', () => {
  describe('createNavigatorEffect', () => {
    it('sets idle state when summary exists', () => {
      const getPracticeSessionReviewFn = vi.fn();
      const setNavigator = vi.fn();
      const setNavigatorLoadState = vi.fn();

      createNavigatorEffect({
        summary: {
          sessionId: 'session-1',
          endedAt: '2026-02-01T00:00:00.000Z',
          totals: { answered: 1, correct: 1, accuracy: 1, durationSeconds: 1 },
        },
        isInReviewStage: false,
        sessionInfo: null,
        sessionId: 'session-1',
        getPracticeSessionReviewFn,
        setNavigator,
        setNavigatorLoadState,
      });

      expect(getPracticeSessionReviewFn).not.toHaveBeenCalled();
      expect(setNavigator).toHaveBeenCalledWith(null);
      expect(setNavigatorLoadState).toHaveBeenCalledWith({ status: 'idle' });
    });

    it('sets idle state when review stage is active', () => {
      const getPracticeSessionReviewFn = vi.fn();
      const setNavigator = vi.fn();
      const setNavigatorLoadState = vi.fn();

      createNavigatorEffect({
        summary: null,
        isInReviewStage: true,
        sessionInfo: {
          sessionId: 'session-1',
          mode: 'tutor',
          index: 0,
          total: 2,
        },
        sessionId: 'session-1',
        getPracticeSessionReviewFn,
        setNavigator,
        setNavigatorLoadState,
      });

      expect(getPracticeSessionReviewFn).not.toHaveBeenCalled();
      expect(setNavigator).toHaveBeenCalledWith(null);
      expect(setNavigatorLoadState).toHaveBeenCalledWith({ status: 'idle' });
    });

    it('loads navigator and transitions to ready on success', async () => {
      const deferred =
        createDeferred<ActionResult<GetPracticeSessionReviewOutput>>();
      const getPracticeSessionReviewFn = vi.fn(async () => deferred.promise);
      const setNavigator = vi.fn();
      const setNavigatorLoadState = vi.fn();
      const navigator = {
        ok: true,
      } as unknown as GetPracticeSessionReviewOutput;

      createNavigatorEffect({
        summary: null,
        isInReviewStage: false,
        sessionInfo: {
          sessionId: 'session-1',
          mode: 'tutor',
          index: 0,
          total: 2,
        },
        sessionId: 'session-1',
        getPracticeSessionReviewFn,
        setNavigator,
        setNavigatorLoadState,
        isMounted: () => true,
      });

      expect(setNavigatorLoadState).toHaveBeenCalledWith({ status: 'loading' });

      deferred.resolve(ok(navigator));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(setNavigator).toHaveBeenCalledWith(navigator);
      expect(setNavigatorLoadState).toHaveBeenLastCalledWith({
        status: 'ready',
      });
    });

    it('sets error state on non-ok result', async () => {
      const getPracticeSessionReviewFn = vi.fn(async () =>
        err('INTERNAL_ERROR', 'Nope'),
      );
      const setNavigator = vi.fn();
      const setNavigatorLoadState = vi.fn();

      createNavigatorEffect({
        summary: null,
        isInReviewStage: false,
        sessionInfo: {
          sessionId: 'session-1',
          mode: 'tutor',
          index: 0,
          total: 2,
        },
        sessionId: 'session-1',
        getPracticeSessionReviewFn,
        setNavigator,
        setNavigatorLoadState,
      });

      await new Promise((r) => setTimeout(r, 0));

      expect(setNavigator).toHaveBeenCalledWith(null);
      expect(setNavigatorLoadState).toHaveBeenLastCalledWith({
        status: 'error',
        message: 'Nope',
      });
    });

    it('sets error state when the request throws', async () => {
      const getPracticeSessionReviewFn = vi.fn(async () => {
        throw new Error('boom');
      });
      const setNavigator = vi.fn();
      const setNavigatorLoadState = vi.fn();

      createNavigatorEffect({
        summary: null,
        isInReviewStage: false,
        sessionInfo: {
          sessionId: 'session-1',
          mode: 'tutor',
          index: 0,
          total: 2,
        },
        sessionId: 'session-1',
        getPracticeSessionReviewFn,
        setNavigator,
        setNavigatorLoadState,
      });

      await new Promise((r) => setTimeout(r, 0));

      expect(setNavigator).toHaveBeenCalledWith(null);
      expect(setNavigatorLoadState).toHaveBeenLastCalledWith({
        status: 'error',
        message: 'boom',
      });
    });
  });

  describe('createSummaryReviewEffect', () => {
    it('sets idle state when summary is null', () => {
      const getPracticeSessionReviewFn = vi.fn();
      const setSummaryReview = vi.fn();
      const setSummaryReviewLoadState = vi.fn();

      createSummaryReviewEffect({
        summary: null,
        sessionId: 'session-1',
        getPracticeSessionReviewFn,
        setSummaryReview,
        setSummaryReviewLoadState,
      });

      expect(getPracticeSessionReviewFn).not.toHaveBeenCalled();
      expect(setSummaryReview).toHaveBeenCalledWith(null);
      expect(setSummaryReviewLoadState).toHaveBeenCalledWith({
        status: 'idle',
      });
    });

    it('loads review and transitions to ready on success', async () => {
      const deferred =
        createDeferred<ActionResult<GetPracticeSessionReviewOutput>>();
      const getPracticeSessionReviewFn = vi.fn(async () => deferred.promise);
      const setSummaryReview = vi.fn();
      const setSummaryReviewLoadState = vi.fn();
      const summaryReview = {
        ok: true,
      } as unknown as GetPracticeSessionReviewOutput;

      createSummaryReviewEffect({
        summary: {
          sessionId: 'session-1',
          endedAt: '2026-02-01T00:00:00.000Z',
          totals: { answered: 1, correct: 1, accuracy: 1, durationSeconds: 1 },
        },
        sessionId: 'session-1',
        getPracticeSessionReviewFn,
        setSummaryReview,
        setSummaryReviewLoadState,
        isMounted: () => true,
      });

      expect(setSummaryReviewLoadState).toHaveBeenCalledWith({
        status: 'loading',
      });

      deferred.resolve(ok(summaryReview));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(setSummaryReview).toHaveBeenLastCalledWith(summaryReview);
      expect(setSummaryReviewLoadState).toHaveBeenLastCalledWith({
        status: 'ready',
      });
    });

    it('sets error state when request throws', async () => {
      const getPracticeSessionReviewFn = vi.fn(async () => {
        throw new Error('boom');
      });
      const setSummaryReview = vi.fn();
      const setSummaryReviewLoadState = vi.fn();

      createSummaryReviewEffect({
        summary: {
          sessionId: 'session-1',
          endedAt: '2026-02-01T00:00:00.000Z',
          totals: { answered: 1, correct: 1, accuracy: 1, durationSeconds: 1 },
        },
        sessionId: 'session-1',
        getPracticeSessionReviewFn,
        setSummaryReview,
        setSummaryReviewLoadState,
      });

      await new Promise((r) => setTimeout(r, 0));

      expect(setSummaryReviewLoadState).toHaveBeenLastCalledWith({
        status: 'error',
        message: 'boom',
      });
    });

    it('sets error state on non-ok result', async () => {
      const getPracticeSessionReviewFn = vi.fn(async () =>
        err('INTERNAL_ERROR', 'Nope'),
      );
      const setSummaryReview = vi.fn();
      const setSummaryReviewLoadState = vi.fn();

      createSummaryReviewEffect({
        summary: {
          sessionId: 'session-1',
          endedAt: '2026-02-01T00:00:00.000Z',
          totals: { answered: 1, correct: 1, accuracy: 1, durationSeconds: 1 },
        },
        sessionId: 'session-1',
        getPracticeSessionReviewFn,
        setSummaryReview,
        setSummaryReviewLoadState,
      });

      await new Promise((r) => setTimeout(r, 0));

      expect(setSummaryReviewLoadState).toHaveBeenLastCalledWith({
        status: 'error',
        message: 'Nope',
      });
      expect(setSummaryReview).toHaveBeenCalledTimes(1);
      expect(setSummaryReview).toHaveBeenLastCalledWith(null);
    });
  });
});
