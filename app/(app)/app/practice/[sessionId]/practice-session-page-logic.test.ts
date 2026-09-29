import { afterEach, describe, expect, it, vi } from 'vitest';

const fixtureAttempt1Id = crypto.randomUUID();
const fixtureChoice1Id = crypto.randomUUID();
const fixtureQuestion1Id = crypto.randomUUID();
const fixtureQuestion2Id = crypto.randomUUID();
const fixtureQuestion9Id = crypto.randomUUID();
const fixtureSession1Id = crypto.randomUUID();

const { captureExceptionMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: captureExceptionMock,
}));

import {
  createLoadNextQuestionAction,
  loadNextQuestion,
  submitAnswerForQuestion,
} from '@/app/(app)/app/practice/[sessionId]/practice-session-page-logic';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { err, ok } from '@/src/adapters/controllers/action-result';
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

describe('practice-session-page-logic', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    captureExceptionMock.mockReset();
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
        setWithdrawnQuestionId: vi.fn(),
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
        setWithdrawnQuestionId: vi.fn(),
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
        setWithdrawnQuestionId: vi.fn(),
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

    // ADR-021 §3, Pattern Registry F-11: a question withdrawn after the
    // session began comes back as its place in the session, with no content.
    it('records a withdrawn item, with no question, and moves the session to it', async () => {
      const setLoadState = vi.fn();
      const setQuestion = vi.fn();
      const setSessionInfo = vi.fn();
      const setWithdrawnQuestionId = vi.fn();

      await loadNextQuestion({
        sessionId: fixtureSession1Id,
        getNextQuestionFn: async () =>
          ok({
            withdrawn: true as const,
            questionId: fixtureQuestion2Id,
            session: {
              sessionId: fixtureSession1Id,
              mode: 'exam' as const,
              index: 1,
              total: 2,
              deadlineAt: null,
              isMarkedForReview: false,
            },
          }),
        nowMs: () => 1234,
        setLoadState,
        setSelectedChoiceId: vi.fn(),
        setSubmitResult: vi.fn(),
        setSubmitRequestToken: vi.fn(),
        setQuestionLoadedAt: vi.fn(),
        setQuestion,
        setSessionInfo,
        setWithdrawnQuestionId,
      });

      expect(setWithdrawnQuestionId).toHaveBeenLastCalledWith(
        fixtureQuestion2Id,
      );
      expect(setQuestion).toHaveBeenLastCalledWith(null);
      expect(setSessionInfo).toHaveBeenLastCalledWith(
        expect.objectContaining({ mode: 'exam', index: 1, total: 2 }),
      );
      expect(setLoadState).toHaveBeenLastCalledWith({ status: 'ready' });
    });

    it('clears a recorded withdrawn item when a question loads', async () => {
      const setQuestion = vi.fn();
      const setWithdrawnQuestionId = vi.fn();

      await loadNextQuestion({
        sessionId: fixtureSession1Id,
        getNextQuestionFn: async () => ok(createFixtureNextQuestion()),
        nowMs: () => 1234,
        setLoadState: vi.fn(),
        setSelectedChoiceId: vi.fn(),
        setSubmitResult: vi.fn(),
        setSubmitRequestToken: vi.fn(),
        setQuestionLoadedAt: vi.fn(),
        setQuestion,
        setSessionInfo: vi.fn(),
        setWithdrawnQuestionId,
      });

      expect(setWithdrawnQuestionId).toHaveBeenLastCalledWith(null);
      expect(setQuestion).toHaveBeenLastCalledWith(
        expect.objectContaining({ questionId: fixtureQuestion1Id }),
      );
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
        setWithdrawnQuestionId: vi.fn(),
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
        setWithdrawnQuestionId: vi.fn(),
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
        setWithdrawnQuestionId: vi.fn(),
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
        setWithdrawnQuestionId: vi.fn(),
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
        setWithdrawnQuestionId: vi.fn(),
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
        setWithdrawnQuestionId: vi.fn(),
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
        setWithdrawnQuestionId: vi.fn(),
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

    // ADR-021 §3: the question was withdrawn while the learner had it open;
    // reloading the item shows the withdrawal notice instead of an error.
    it('recovers instead of showing an error when the submitted question is not found', async () => {
      const setLoadState = vi.fn();
      const recoverQuestionNotFound = vi.fn(async () => undefined);

      await submitAnswerForQuestion({
        sessionId: fixtureSession1Id,
        question: createFixtureNextQuestion(),
        selectedChoiceId: fixtureChoice1Id,
        questionLoadedAtMs: 0,
        submitRequestToken: null,
        createIdempotencyKey: () => 'idem_1',
        setSubmitRequestToken: vi.fn(),
        submitAnswerFn: async () => err('NOT_FOUND', 'Question not found'),
        nowMs: () => 0,
        setLoadState,
        setSubmitResult: vi.fn(),
        recoverQuestionNotFound,
      });

      expect(recoverQuestionNotFound).toHaveBeenCalledTimes(1);
      expect(setLoadState).not.toHaveBeenCalledWith(
        expect.objectContaining({ status: 'error' }),
      );
    });

    it('still shows other submit errors when a not-found recovery is given', async () => {
      const setLoadState = vi.fn();
      const recoverQuestionNotFound = vi.fn(async () => undefined);

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
        recoverQuestionNotFound,
      });

      expect(recoverQuestionNotFound).not.toHaveBeenCalled();
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
});
