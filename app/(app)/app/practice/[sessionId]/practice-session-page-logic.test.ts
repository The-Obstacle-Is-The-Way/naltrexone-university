import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  fixtureAttempt1Id,
  fixtureChoice1Id,
  fixtureQuestion1Id,
  fixtureQuestion2Id,
  fixtureQuestion9Id,
  fixtureSession1Id,
} = vi.hoisted(() => ({
  fixtureAttempt1Id: crypto.randomUUID(),
  fixtureChoice1Id: crypto.randomUUID(),
  fixtureQuestion1Id: crypto.randomUUID(),
  fixtureQuestion2Id: crypto.randomUUID(),
  fixtureQuestion9Id: crypto.randomUUID(),
  fixtureSession1Id: crypto.randomUUID(),
}));

const { reportClientErrorMock } = vi.hoisted(() => ({
  reportClientErrorMock: vi.fn(),
}));

vi.mock('@/lib/report-client-error', () => ({
  reportClientError: reportClientErrorMock,
}));

import {
  createLoadNextQuestionAction,
  createNavigatorEffect,
  createSummaryReviewEffect,
  endSession,
  loadNextQuestion,
  submitAnswerForQuestion,
} from '@/app/(app)/app/practice/[sessionId]/practice-session-page-logic';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { err, ok } from '@/src/adapters/controllers/action-result';
import type {
  EndPracticeSessionOutput,
  GetPracticeSessionReviewOutput,
} from '@/src/adapters/controllers/practice-controller';
import { ApplicationConflictReasons } from '@/src/application/errors';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import { createDeferred } from '@/tests/test-helpers/create-deferred';

function createFixtureNextQuestion(
  overrides: Parameters<typeof createNextQuestion>[0] = {},
) {
  return createNextQuestion({
    questionId: fixtureQuestion1Id,
    choices: [
      {
        id: fixtureChoice1Id,
        label: 'A',
        textMd: 'Choice A',
        sortOrder: 1,
      },
    ],
    ...overrides,
  });
}

function createFixturePracticeSessionReview(
  overrides: Partial<GetPracticeSessionReviewOutput> = {},
): GetPracticeSessionReviewOutput {
  return {
    sessionId: fixtureSession1Id,
    mode: 'tutor',
    totalCount: 0,
    answeredCount: 0,
    markedCount: 0,
    rows: [],
    ...overrides,
  };
}

describe('practice-session-page-logic', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    reportClientErrorMock.mockReset();
  });

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
        sessionId: fixtureSession1Id,
        getNextQuestionFn,
        nowMs: () => 1234,
        setLoadState,
        setSelectedChoiceId: vi.fn(),
        setSubmitResult: vi.fn(),
        setSubmitRequestToken: vi.fn(),
        setQuestionLoadedAt: vi.fn(),
        setQuestion,
        setSessionInfo,
        createRequestSequenceId,
        isLatestRequest,
      });

      const loadSecond = loadNextQuestion({
        sessionId: fixtureSession1Id,
        getNextQuestionFn,
        nowMs: () => 5678,
        setLoadState,
        setSelectedChoiceId: vi.fn(),
        setSubmitResult: vi.fn(),
        setSubmitRequestToken: vi.fn(),
        setQuestionLoadedAt: vi.fn(),
        setQuestion,
        setSessionInfo,
        createRequestSequenceId,
        isLatestRequest,
      });

      second.resolve(
        ok(
          createFixtureNextQuestion({
            questionId: fixtureQuestion2Id,
            slug: 'q-2',
            session: {
              sessionId: fixtureSession1Id,
              mode: 'tutor',

              deadlineAt: null,

              index: 1,
              total: 2,
            },
          }),
        ),
      );
      await loadSecond;

      first.resolve(
        ok(
          createFixtureNextQuestion({
            session: {
              sessionId: fixtureSession1Id,
              mode: 'tutor',

              deadlineAt: null,

              index: 0,
              total: 2,
            },
          }),
        ),
      );
      await loadFirst;

      expect(setQuestion).toHaveBeenCalledTimes(1);
      expect(setQuestion).toHaveBeenCalledWith(
        expect.objectContaining({ questionId: fixtureQuestion2Id }),
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
      const setSubmitRequestToken = vi.fn();
      const setQuestionLoadedAt = vi.fn();
      const setQuestion = vi.fn();
      const setSessionInfo = vi.fn();

      await loadNextQuestion({
        sessionId: fixtureSession1Id,
        getNextQuestionFn: async () =>
          ok(
            createFixtureNextQuestion({
              session: {
                sessionId: fixtureSession1Id,
                mode: 'tutor',

                deadlineAt: null,

                index: 0,
                total: 2,
              },
            }),
          ),
        nowMs: () => 1234,
        setLoadState,
        setSelectedChoiceId,
        setSubmitResult,
        setSubmitRequestToken,
        setQuestionLoadedAt,
        setQuestion,
        setSessionInfo,
      });

      expect(setQuestion).toHaveBeenCalledWith(
        expect.objectContaining({ questionId: fixtureQuestion1Id }),
      );
      expect(setQuestionLoadedAt).toHaveBeenCalledWith(1234);
      expect(setSubmitRequestToken).toHaveBeenLastCalledWith(null);
      expect(setSessionInfo).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'tutor', index: 0 }),
      );
      expect(setLoadState).toHaveBeenCalledWith({ status: 'ready' });
    });

    it('forwards questionId when loading a specific session question', async () => {
      const getNextQuestionFn = vi.fn(async () =>
        ok(createFixtureNextQuestion()),
      );

      await loadNextQuestion({
        sessionId: fixtureSession1Id,
        questionId: fixtureQuestion9Id,
        getNextQuestionFn,
        nowMs: () => 1234,
        setLoadState: vi.fn(),
        setSelectedChoiceId: vi.fn(),
        setSubmitResult: vi.fn(),
        setSubmitRequestToken: vi.fn(),
        setQuestionLoadedAt: vi.fn(),
        setQuestion: vi.fn(),
        setSessionInfo: vi.fn(),
      });

      expect(getNextQuestionFn).toHaveBeenCalledWith({
        sessionId: fixtureSession1Id,
        questionId: fixtureQuestion9Id,
      });
    });

    it('forwards fromIndex when advancing sequentially', async () => {
      const getNextQuestionFn = vi.fn(async () =>
        ok(createFixtureNextQuestion()),
      );

      await loadNextQuestion({
        sessionId: fixtureSession1Id,
        fromIndex: 4,
        getNextQuestionFn,
        nowMs: () => 1234,
        setLoadState: vi.fn(),
        setSelectedChoiceId: vi.fn(),
        setSubmitResult: vi.fn(),
        setSubmitRequestToken: vi.fn(),
        setQuestionLoadedAt: vi.fn(),
        setQuestion: vi.fn(),
        setSessionInfo: vi.fn(),
      });

      expect(getNextQuestionFn).toHaveBeenCalledWith({
        sessionId: fixtureSession1Id,
        fromIndex: 4,
      });
    });

    it('preserves sessionInfo when no next question is returned', async () => {
      const setSubmitRequestToken = vi.fn();
      const setQuestionLoadedAt = vi.fn();
      const setQuestion = vi.fn();
      const setSessionInfo = vi.fn();

      await loadNextQuestion({
        sessionId: fixtureSession1Id,
        getNextQuestionFn: async () => ok(null),
        nowMs: () => 1234,
        setLoadState: vi.fn(),
        setSelectedChoiceId: vi.fn(),
        setSubmitResult: vi.fn(),
        setSubmitRequestToken,
        setQuestionLoadedAt,
        setQuestion,
        setSessionInfo,
      });

      expect(setQuestion).toHaveBeenCalledWith(null);
      expect(setQuestionLoadedAt).toHaveBeenLastCalledWith(null);
      expect(setSubmitRequestToken).toHaveBeenLastCalledWith(null);
      expect(setSessionInfo).not.toHaveBeenCalled();
    });

    it('sets error state when controller fails', async () => {
      const setLoadState = vi.fn();
      const setQuestion = vi.fn();
      const setSubmitRequestToken = vi.fn();

      await loadNextQuestion({
        sessionId: fixtureSession1Id,
        getNextQuestionFn: async () => err('INTERNAL_ERROR', 'Boom'),
        nowMs: () => 0,
        setLoadState,
        setSelectedChoiceId: vi.fn(),
        setSubmitResult: vi.fn(),
        setSubmitRequestToken,
        setQuestionLoadedAt: vi.fn(),
        setQuestion,
        setSessionInfo: vi.fn(),
      });

      expect(setQuestion).toHaveBeenCalledWith(null);
      expect(setLoadState).toHaveBeenCalledWith({
        status: 'error',
        message: 'Boom',
      });
      expect(setSubmitRequestToken).toHaveBeenLastCalledWith(null);
    });

    it('sets error state when controller throws', async () => {
      const setLoadState = vi.fn();
      const setQuestionLoadedAt = vi.fn();
      const setSubmitRequestToken = vi.fn();
      const setQuestion = vi.fn();

      await loadNextQuestion({
        sessionId: fixtureSession1Id,
        getNextQuestionFn: async () => {
          throw new Error('Boom');
        },
        nowMs: () => 0,
        setLoadState,
        setSelectedChoiceId: vi.fn(),
        setSubmitResult: vi.fn(),
        setSubmitRequestToken,
        setQuestionLoadedAt,
        setQuestion,
        setSessionInfo: vi.fn(),
      });

      expect(setQuestion).toHaveBeenCalledWith(null);
      expect(setQuestionLoadedAt).toHaveBeenLastCalledWith(null);
      expect(setSubmitRequestToken).toHaveBeenLastCalledWith(null);
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
      const setSubmitRequestToken = vi.fn();
      const setQuestion = vi.fn();
      const setSessionInfo = vi.fn();

      const promise = loadNextQuestion({
        sessionId: fixtureSession1Id,
        getNextQuestionFn: async () => deferred.promise,
        nowMs: () => 1234,
        setLoadState,
        setSelectedChoiceId: vi.fn(),
        setSubmitResult: vi.fn(),
        setSubmitRequestToken,
        setQuestionLoadedAt,
        setQuestion,
        setSessionInfo,
        isMounted: () => mounted,
      });

      mounted = false;
      deferred.resolve(ok(createFixtureNextQuestion()));
      await promise;

      expect(setQuestion).not.toHaveBeenCalled();
      expect(setQuestionLoadedAt).not.toHaveBeenCalledWith(1234);
      expect(setSubmitRequestToken).toHaveBeenCalledTimes(1);
      expect(setSessionInfo).not.toHaveBeenCalled();
      expect(setLoadState).not.toHaveBeenCalledWith({ status: 'ready' });
    });
  });

  describe('createLoadNextQuestionAction', () => {
    it('runs load inside startTransition', () => {
      const startTransition = vi.fn((fn: () => void) => fn());
      const setLoadState = vi.fn();

      const action = createLoadNextQuestionAction({
        sessionId: fixtureSession1Id,
        startTransition,
        getNextQuestionFn: async () => ok(createFixtureNextQuestion()),
        nowMs: () => 0,
        setLoadState,
        setSelectedChoiceId: vi.fn(),
        setSubmitResult: vi.fn(),
        setSubmitRequestToken: vi.fn(),
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
          attemptId: fixtureAttempt1Id,
          isCorrect: true,
          correctChoiceId: fixtureChoice1Id,
          explanationMd: 'Because...',
          referenceMd: null,
          choiceExplanations: [],
        } satisfies SubmitAnswerOutput),
      );
      const setLoadState = vi.fn();
      const setSubmitResult = vi.fn();

      await submitAnswerForQuestion({
        sessionId: fixtureSession1Id,
        question: createFixtureNextQuestion(),
        selectedChoiceId: fixtureChoice1Id,
        questionLoadedAtMs: 1000,
        submitRequestToken: null,
        createIdempotencyKey: () => 'idem_1',
        setSubmitRequestToken: vi.fn(),
        submitAnswerFn,
        nowMs: () => 5000,
        setLoadState,
        setSubmitResult,
      });

      expect(submitAnswerFn).toHaveBeenCalledWith({
        questionId: fixtureQuestion1Id,
        choiceId: fixtureChoice1Id,
        sessionId: fixtureSession1Id,
        idempotencyKey: 'idem_1',
        timeSpentSeconds: 4,
      });
      expect(setSubmitResult).toHaveBeenCalledWith(
        expect.objectContaining({ isCorrect: true }),
        fixtureQuestion1Id,
      );
      expect(setLoadState).toHaveBeenCalledWith({ status: 'ready' });
    });

    it('does nothing when question is null', async () => {
      const submitAnswerFn = vi.fn(async () =>
        ok({
          attemptId: fixtureAttempt1Id,
          isCorrect: true,
          correctChoiceId: fixtureChoice1Id,
          explanationMd: 'Because...',
          referenceMd: null,
          choiceExplanations: [],
        } satisfies SubmitAnswerOutput),
      );

      const setLoadState = vi.fn();
      const setSubmitResult = vi.fn();

      await submitAnswerForQuestion({
        sessionId: fixtureSession1Id,
        question: null,
        selectedChoiceId: fixtureChoice1Id,
        questionLoadedAtMs: 0,
        submitRequestToken: null,
        createIdempotencyKey: () => 'idem_1',
        setSubmitRequestToken: vi.fn(),
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
          attemptId: fixtureAttempt1Id,
          isCorrect: true,
          correctChoiceId: fixtureChoice1Id,
          explanationMd: 'Because...',
          referenceMd: null,
          choiceExplanations: [],
        } satisfies SubmitAnswerOutput),
      );

      const setLoadState = vi.fn();
      const setSubmitResult = vi.fn();

      await submitAnswerForQuestion({
        sessionId: fixtureSession1Id,
        question: createFixtureNextQuestion(),
        selectedChoiceId: null,
        questionLoadedAtMs: 0,
        submitRequestToken: null,
        createIdempotencyKey: () => 'idem_1',
        setSubmitRequestToken: vi.fn(),
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
        sessionId: fixtureSession1Id,
        question: createFixtureNextQuestion(),
        selectedChoiceId: fixtureChoice1Id,
        questionLoadedAtMs: 0,
        submitRequestToken: null,
        createIdempotencyKey: () => 'idem_1',
        setSubmitRequestToken: vi.fn(),
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
        sessionId: fixtureSession1Id,
        question: createFixtureNextQuestion(),
        selectedChoiceId: fixtureChoice1Id,
        questionLoadedAtMs: 0,
        submitRequestToken: null,
        createIdempotencyKey: () => 'idem_1',
        setSubmitRequestToken: vi.fn(),
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
        sessionId: fixtureSession1Id,
        question: createFixtureNextQuestion(),
        selectedChoiceId: fixtureChoice1Id,
        questionLoadedAtMs: 0,
        submitRequestToken: null,
        createIdempotencyKey: () => 'idem_1',
        setSubmitRequestToken: vi.fn(),
        submitAnswerFn: async () => deferred.promise,
        nowMs: () => 0,
        setLoadState,
        setSubmitResult,
        isMounted: () => mounted,
      });

      mounted = false;
      deferred.resolve(
        ok({
          attemptId: fixtureAttempt1Id,
          isCorrect: true,
          correctChoiceId: fixtureChoice1Id,
          explanationMd: 'Because...',
          referenceMd: null,
          choiceExplanations: [],
        } satisfies SubmitAnswerOutput),
      );
      await promise;

      expect(setSubmitResult).not.toHaveBeenCalled();
      expect(setLoadState).not.toHaveBeenCalledWith({ status: 'ready' });
    });

    it('returns no state updates when submit response is stale', async () => {
      const deferred = createDeferred<ActionResult<SubmitAnswerOutput>>();
      const setLoadState = vi.fn();
      const setSubmitResult = vi.fn();
      const onSuccess = vi.fn();

      const promise = submitAnswerForQuestion({
        sessionId: fixtureSession1Id,
        question: createFixtureNextQuestion(),
        selectedChoiceId: fixtureChoice1Id,
        questionLoadedAtMs: 0,
        submitRequestToken: null,
        createIdempotencyKey: () => 'idem_1',
        setSubmitRequestToken: vi.fn(),
        submitAnswerFn: async () => deferred.promise,
        nowMs: () => 0,
        setLoadState,
        setSubmitResult,
        onSuccess,
        createRequestSequenceId: () => 1,
        isLatestRequest: () => false,
      });

      deferred.resolve(
        ok({
          attemptId: fixtureAttempt1Id,
          isCorrect: true,
          correctChoiceId: fixtureChoice1Id,
          explanationMd: 'Because...',
          referenceMd: null,
          choiceExplanations: [],
        } satisfies SubmitAnswerOutput),
      );
      await promise;

      expect(setSubmitResult).not.toHaveBeenCalled();
      expect(setLoadState).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });

  describe('endSession', () => {
    const successfulEndSessionOutput: EndPracticeSessionOutput = {
      sessionId: fixtureSession1Id,
      endedAt: '2026-02-01T00:00:00.000Z',
      mode: 'tutor',
      questionCount: 10,
      totals: {
        answered: 10,
        correct: 7,
        accuracy: 0.7,
        durationSeconds: 123,
      },
    };
    const createUnusedGetPracticeSessionSummaryFn = () =>
      vi.fn(async (): Promise<ActionResult<EndPracticeSessionOutput>> => {
        throw new Error('getPracticeSessionSummaryFn should not be called');
      });

    it('sets summary and resets state on success', async () => {
      const setSummary = vi.fn();
      const resetQuestionState = vi.fn();
      const finalizeSessionFn = vi.fn(async () =>
        ok(successfulEndSessionOutput),
      );

      await endSession({
        sessionId: fixtureSession1Id,
        endSessionIdempotencyKey: 'idem_1',
        finalizeSessionFn,
        getPracticeSessionSummaryFn: createUnusedGetPracticeSessionSummaryFn(),
        setLoadState: vi.fn(),
        setSummary,
        resetQuestionState,
      });

      expect(finalizeSessionFn).toHaveBeenCalledWith({
        sessionId: fixtureSession1Id,
        idempotencyKey: 'idem_1',
      });
      expect(setSummary).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: fixtureSession1Id }),
      );
      expect(resetQuestionState).toHaveBeenCalledTimes(1);
    });

    it('sets error state when controller fails', async () => {
      const setLoadState = vi.fn();

      await endSession({
        sessionId: fixtureSession1Id,
        endSessionIdempotencyKey: 'idem_1',
        finalizeSessionFn: async () => err('INTERNAL_ERROR', 'Boom'),
        getPracticeSessionSummaryFn: createUnusedGetPracticeSessionSummaryFn(),
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
        sessionId: fixtureSession1Id,
        endSessionIdempotencyKey: 'idem_1',
        finalizeSessionFn: async () => err('INTERNAL_ERROR', 'Boom'),
        getPracticeSessionSummaryFn: createUnusedGetPracticeSessionSummaryFn(),
        setLoadState: vi.fn(),
        setSummary: vi.fn(),
        resetQuestionState: vi.fn(),
        rotateIdempotencyKey,
      });

      expect(rotateIdempotencyKey).toHaveBeenCalledTimes(1);
    });

    it('returns recovered summary state when endPracticeSession returns CONFLICT', async () => {
      const setLoadState = vi.fn();
      const setSummary = vi.fn();
      const resetQuestionState = vi.fn();
      const getPracticeSessionSummaryFn = vi.fn(async () =>
        ok(successfulEndSessionOutput),
      );

      await endSession({
        sessionId: fixtureSession1Id,
        endSessionIdempotencyKey: 'idem_1',
        finalizeSessionFn: async () =>
          err('CONFLICT', 'Practice session already ended'),
        getPracticeSessionSummaryFn,
        setLoadState,
        setSummary,
        resetQuestionState,
      });

      expect(getPracticeSessionSummaryFn).toHaveBeenCalledWith({
        sessionId: fixtureSession1Id,
      });
      expect(setSummary).toHaveBeenCalledWith(successfulEndSessionOutput);
      expect(resetQuestionState).toHaveBeenCalledTimes(1);
      expect(setLoadState).toHaveBeenLastCalledWith({ status: 'ready' });
    });

    it('briefly re-polls summary when the idempotency wrapper reports a concurrent request still in progress', async () => {
      vi.useFakeTimers();
      try {
        const setLoadState = vi.fn();
        const setSummary = vi.fn();
        const resetQuestionState = vi.fn();
        const getPracticeSessionSummaryFn = vi
          .fn<() => Promise<ActionResult<EndPracticeSessionOutput>>>()
          .mockResolvedValueOnce(
            err('CONFLICT', 'Practice session has not ended'),
          )
          .mockResolvedValueOnce(ok(successfulEndSessionOutput));

        const promise = endSession({
          sessionId: fixtureSession1Id,
          endSessionIdempotencyKey: 'idem_1',
          finalizeSessionFn: async () =>
            err(
              'CONFLICT',
              'Request timed out waiting for idempotency key. The concurrent request may still be in progress or may have failed.',
              undefined,
              {
                reason: ApplicationConflictReasons.ConcurrentRequestInProgress,
              },
            ),
          getPracticeSessionSummaryFn,
          setLoadState,
          setSummary,
          resetQuestionState,
        });

        await vi.runAllTimersAsync();
        await promise;

        expect(getPracticeSessionSummaryFn).toHaveBeenCalledTimes(2);
        expect(setSummary).toHaveBeenCalledWith(successfulEndSessionOutput);
        expect(resetQuestionState).toHaveBeenCalledTimes(1);
        expect(setLoadState).toHaveBeenLastCalledWith({ status: 'ready' });
      } finally {
        vi.useRealTimers();
      }
    });

    it('keeps the idempotency key and reports still-processing when concurrent request recovery cannot resolve a summary', async () => {
      vi.useFakeTimers();
      try {
        const setLoadState = vi.fn();
        const rotateIdempotencyKey = vi.fn();
        const getPracticeSessionSummaryFn = vi
          .fn<() => Promise<ActionResult<EndPracticeSessionOutput>>>()
          .mockResolvedValue(err('CONFLICT', 'Practice session has not ended'));

        const promise = endSession({
          sessionId: fixtureSession1Id,
          endSessionIdempotencyKey: 'idem_1',
          finalizeSessionFn: async () =>
            err(
              'CONFLICT',
              'Request timed out waiting for idempotency key. The concurrent request may still be in progress or may have failed.',
              undefined,
              {
                reason: ApplicationConflictReasons.ConcurrentRequestInProgress,
              },
            ),
          getPracticeSessionSummaryFn,
          setLoadState,
          setSummary: vi.fn(),
          resetQuestionState: vi.fn(),
          rotateIdempotencyKey,
        });

        await vi.runAllTimersAsync();
        await promise;

        expect(getPracticeSessionSummaryFn).toHaveBeenCalledTimes(2);
        expect(rotateIdempotencyKey).not.toHaveBeenCalled();
        expect(setLoadState).toHaveBeenLastCalledWith({
          status: 'error',
          message:
            'Your previous request is still processing. Please try again shortly.',
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it('returns an error when summary recovery fails and endPracticeSession returns CONFLICT', async () => {
      const setLoadState = vi.fn();
      const rotateIdempotencyKey = vi.fn();

      await endSession({
        sessionId: fixtureSession1Id,
        endSessionIdempotencyKey: 'idem_1',
        finalizeSessionFn: async () =>
          err('CONFLICT', 'Practice session already ended'),
        getPracticeSessionSummaryFn: async () =>
          err('NOT_FOUND', 'Practice session summary not found'),
        setLoadState,
        setSummary: vi.fn(),
        resetQuestionState: vi.fn(),
        rotateIdempotencyKey,
      });

      expect(rotateIdempotencyKey).toHaveBeenCalledTimes(1);
      expect(setLoadState).toHaveBeenLastCalledWith({
        status: 'error',
        message: 'Practice session summary not found',
      });
    });

    it('returns an error when summary recovery throws and endPracticeSession returns CONFLICT', async () => {
      const setLoadState = vi.fn();
      const rotateIdempotencyKey = vi.fn();
      const error = new Error('Summary fetch failed');

      await endSession({
        sessionId: fixtureSession1Id,
        endSessionIdempotencyKey: 'idem_1',
        finalizeSessionFn: async () =>
          err('CONFLICT', 'Practice session already ended'),
        getPracticeSessionSummaryFn: async () => {
          throw error;
        },
        setLoadState,
        setSummary: vi.fn(),
        resetQuestionState: vi.fn(),
        rotateIdempotencyKey,
      });

      expect(rotateIdempotencyKey).toHaveBeenCalledTimes(1);
      expect(setLoadState).toHaveBeenLastCalledWith({
        status: 'error',
        message: 'Summary fetch failed',
      });
      expect(reportClientErrorMock).toHaveBeenCalledWith(error, {
        component: 'PracticeSessionPageLogic',
        action: 'getPracticeSessionSummary',
      });
    });

    it('sets error state when controller throws', async () => {
      const setLoadState = vi.fn();
      const error = new Error('Boom');

      await endSession({
        sessionId: fixtureSession1Id,
        endSessionIdempotencyKey: 'idem_1',
        finalizeSessionFn: async () => {
          throw error;
        },
        getPracticeSessionSummaryFn: createUnusedGetPracticeSessionSummaryFn(),
        setLoadState,
        setSummary: vi.fn(),
        resetQuestionState: vi.fn(),
      });

      expect(setLoadState).toHaveBeenCalledWith({
        status: 'error',
        message: 'Boom',
      });
      expect(reportClientErrorMock).toHaveBeenCalledWith(error, {
        component: 'PracticeSessionPageLogic',
        action: 'endSession',
      });
    });

    it('calls rotateIdempotencyKey when controller throws', async () => {
      const rotateIdempotencyKey = vi.fn();

      await endSession({
        sessionId: fixtureSession1Id,
        endSessionIdempotencyKey: 'idem_1',
        finalizeSessionFn: async () => {
          throw new Error('Boom');
        },
        getPracticeSessionSummaryFn: createUnusedGetPracticeSessionSummaryFn(),
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
        sessionId: fixtureSession1Id,
        endSessionIdempotencyKey: 'idem_1',
        finalizeSessionFn: async () => ok(successfulEndSessionOutput),
        getPracticeSessionSummaryFn: createUnusedGetPracticeSessionSummaryFn(),
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
        sessionId: fixtureSession1Id,
        endSessionIdempotencyKey: 'idem_1',
        finalizeSessionFn: async () => deferred.promise,
        getPracticeSessionSummaryFn: createUnusedGetPracticeSessionSummaryFn(),
        setLoadState,
        setSummary,
        resetQuestionState: vi.fn(),
        isMounted: () => mounted,
      });

      mounted = false;
      deferred.resolve(
        ok({
          sessionId: fixtureSession1Id,
          endedAt: '2026-02-01T00:00:00.000Z',
          mode: 'tutor',
          questionCount: 1,
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
  afterEach(() => {
    vi.restoreAllMocks();
    reportClientErrorMock.mockReset();
  });

  describe('createNavigatorEffect', () => {
    it('sets idle state when summary exists', () => {
      const getPracticeSessionReviewFn = vi.fn();
      const setNavigator = vi.fn();
      const setNavigatorLoadState = vi.fn();

      createNavigatorEffect({
        summary: {
          sessionId: fixtureSession1Id,
          endedAt: '2026-02-01T00:00:00.000Z',
          mode: 'tutor',
          questionCount: 1,
          totals: { answered: 1, correct: 1, accuracy: 1, durationSeconds: 1 },
        },
        isInReviewStage: false,
        sessionInfo: null,
        sessionId: fixtureSession1Id,
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
          sessionId: fixtureSession1Id,
          mode: 'tutor',

          deadlineAt: null,

          index: 0,
          total: 2,
        },
        sessionId: fixtureSession1Id,
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
      const navigator = createFixturePracticeSessionReview();

      createNavigatorEffect({
        summary: null,
        isInReviewStage: false,
        sessionInfo: {
          sessionId: fixtureSession1Id,
          mode: 'tutor',

          deadlineAt: null,

          index: 0,
          total: 2,
        },
        sessionId: fixtureSession1Id,
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
          sessionId: fixtureSession1Id,
          mode: 'tutor',

          deadlineAt: null,

          index: 0,
          total: 2,
        },
        sessionId: fixtureSession1Id,
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
      const error = new Error('boom');
      const getPracticeSessionReviewFn = vi.fn(async () => {
        throw error;
      });
      const setNavigator = vi.fn();
      const setNavigatorLoadState = vi.fn();

      createNavigatorEffect({
        summary: null,
        isInReviewStage: false,
        sessionInfo: {
          sessionId: fixtureSession1Id,
          mode: 'tutor',

          deadlineAt: null,

          index: 0,
          total: 2,
        },
        sessionId: fixtureSession1Id,
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
      expect(reportClientErrorMock).toHaveBeenCalledWith(error, {
        component: 'PracticeSessionPageLogic',
        action: 'loadNavigator',
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
        sessionId: fixtureSession1Id,
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
      const summaryReview = createFixturePracticeSessionReview();

      createSummaryReviewEffect({
        summary: {
          sessionId: fixtureSession1Id,
          endedAt: '2026-02-01T00:00:00.000Z',
          mode: 'tutor',
          questionCount: 1,
          totals: { answered: 1, correct: 1, accuracy: 1, durationSeconds: 1 },
        },
        sessionId: fixtureSession1Id,
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
      const error = new Error('boom');
      const getPracticeSessionReviewFn = vi.fn(async () => {
        throw error;
      });
      const setSummaryReview = vi.fn();
      const setSummaryReviewLoadState = vi.fn();

      createSummaryReviewEffect({
        summary: {
          sessionId: fixtureSession1Id,
          endedAt: '2026-02-01T00:00:00.000Z',
          mode: 'tutor',
          questionCount: 1,
          totals: { answered: 1, correct: 1, accuracy: 1, durationSeconds: 1 },
        },
        sessionId: fixtureSession1Id,
        getPracticeSessionReviewFn,
        setSummaryReview,
        setSummaryReviewLoadState,
      });

      await new Promise((r) => setTimeout(r, 0));

      expect(setSummaryReviewLoadState).toHaveBeenLastCalledWith({
        status: 'error',
        message: 'boom',
      });
      expect(reportClientErrorMock).toHaveBeenCalledWith(error, {
        component: 'PracticeSessionPageLogic',
        action: 'loadSummaryReview',
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
          sessionId: fixtureSession1Id,
          endedAt: '2026-02-01T00:00:00.000Z',
          mode: 'tutor',
          questionCount: 1,
          totals: { answered: 1, correct: 1, accuracy: 1, durationSeconds: 1 },
        },
        sessionId: fixtureSession1Id,
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
