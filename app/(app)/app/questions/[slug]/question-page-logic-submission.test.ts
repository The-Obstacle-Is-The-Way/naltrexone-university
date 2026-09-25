import { afterEach, describe, expect, it, vi } from 'vitest';

const fixtureAttempt1Id = crypto.randomUUID();
const fixtureAttemptParent1Id = crypto.randomUUID();
const fixtureAttemptRetry1Id = crypto.randomUUID();
const fixtureAttemptRetry2Id = crypto.randomUUID();
const fixtureChoice1Id = crypto.randomUUID();
const fixtureQuestion1Id = crypto.randomUUID();
const fixtureSession1Id = crypto.randomUUID();

const { captureExceptionMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: captureExceptionMock,
}));

import {
  canSubmitQuestionAnswer,
  createSubmitSelectedAnswerAction,
  reattemptQuestion,
  submitSelectedAnswer,
} from '@/app/(app)/app/questions/[slug]/question-page-logic';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { err, ok } from '@/src/adapters/controllers/action-result';
import type { GetQuestionBySlugOutput } from '@/src/adapters/controllers/question-view-controller';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import { createQuestion } from '@/src/domain/test-helpers';
import { createDeferred } from '@/tests/test-helpers/create-deferred';

function createQuestionOutput(): GetQuestionBySlugOutput {
  const question = createQuestion({
    id: fixtureQuestion1Id,
    slug: 'q-1',
    stemMd: '#',
    difficulty: 'easy',
    choices: [],
  });

  return {
    questionId: question.id,
    slug: question.slug,
    stemMd: question.stemMd,
    difficulty: question.difficulty,
    choices: question.choices.map((c) => ({
      id: c.id,
      label: c.label,
      textMd: c.textMd,
    })),
  };
}

describe('question-page-logic', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    captureExceptionMock.mockReset();
  });

  describe('canSubmitQuestionAnswer', () => {
    it('returns false when loadState is loading', () => {
      expect(
        canSubmitQuestionAnswer({
          loadState: { status: 'loading' },
          question: createQuestionOutput(),
          selectedChoiceId: fixtureChoice1Id,
          submitResult: null,
        }),
      ).toBe(false);
    });

    it('returns true when question is loaded, a choice is selected, and no submit result exists', () => {
      expect(
        canSubmitQuestionAnswer({
          loadState: { status: 'ready' },
          question: createQuestionOutput(),
          selectedChoiceId: fixtureChoice1Id,
          submitResult: null,
        }),
      ).toBe(true);
    });

    it('returns false when question is null', () => {
      expect(
        canSubmitQuestionAnswer({
          loadState: { status: 'ready' },
          question: null,
          selectedChoiceId: fixtureChoice1Id,
          submitResult: null,
        }),
      ).toBe(false);
    });

    it('returns false when no choice is selected', () => {
      expect(
        canSubmitQuestionAnswer({
          loadState: { status: 'ready' },
          question: createQuestionOutput(),
          selectedChoiceId: null,
          submitResult: null,
        }),
      ).toBe(false);
    });

    it('returns false when a submit result already exists', () => {
      expect(
        canSubmitQuestionAnswer({
          loadState: { status: 'ready' },
          question: createQuestionOutput(),
          selectedChoiceId: fixtureChoice1Id,
          submitResult: {
            attemptId: fixtureAttempt1Id,
            isCorrect: true,
            correctChoiceId: fixtureChoice1Id,
            explanationMd: null,
            referenceMd: null,
            choiceExplanations: [],
          } satisfies SubmitAnswerOutput,
        }),
      ).toBe(false);
    });

    it('returns true for review plus session context', () => {
      expect(
        canSubmitQuestionAnswer({
          loadState: { status: 'ready' },
          question: createQuestionOutput(),
          selectedChoiceId: fixtureChoice1Id,
          submitResult: null,
          mode: 'review',
          sessionId: '00000000-0000-4000-8000-000000000001',
        }),
      ).toBe(true);
    });
  });

  describe('createSubmitSelectedAnswerAction', () => {
    it('runs submit inside startTransition', async () => {
      const startTransition = vi.fn((fn: () => void) => fn());
      const setLoadState = vi.fn();
      const setSubmitResult = vi.fn();
      const submitResult = {
        attemptId: fixtureAttempt1Id,
        isCorrect: true,
        correctChoiceId: fixtureChoice1Id,
        explanationMd: null,
        referenceMd: null,
        choiceExplanations: [],
      } satisfies SubmitAnswerOutput;

      const action = createSubmitSelectedAnswerAction({
        startTransition,
        question: createQuestionOutput(),
        selectedChoiceId: fixtureChoice1Id,
        questionLoadedAtMs: 0,
        submitRequestToken: null,
        createIdempotencyKey: () => 'idem_1',
        setSubmitRequestToken: vi.fn(),
        submitAnswerFn: async () => ok(submitResult),
        nowMs: () => 1000,
        setLoadState,
        setSubmitResult,
      });

      await action();

      expect(startTransition).toHaveBeenCalledTimes(1);
      expect(setLoadState).toHaveBeenCalledWith({ status: 'loading' });
      expect(setSubmitResult).toHaveBeenCalledWith(submitResult);
      expect(setLoadState).toHaveBeenCalledWith({ status: 'ready' });
    });

    it('calls onSuccess with the submit result after a successful submit', async () => {
      const startTransition = vi.fn((fn: () => void) => fn());
      const setLoadState = vi.fn();
      const setSubmitResult = vi.fn();
      const onSuccess = vi.fn();
      const submitResult = {
        attemptId: fixtureAttempt1Id,
        isCorrect: true,
        correctChoiceId: fixtureChoice1Id,
        explanationMd: null,
        referenceMd: null,
        choiceExplanations: [],
      } satisfies SubmitAnswerOutput;

      const action = createSubmitSelectedAnswerAction({
        startTransition,
        question: createQuestionOutput(),
        selectedChoiceId: fixtureChoice1Id,
        questionLoadedAtMs: 0,
        submitRequestToken: null,
        createIdempotencyKey: () => 'idem_1',
        setSubmitRequestToken: vi.fn(),
        submitAnswerFn: async () => ok(submitResult),
        nowMs: () => 1000,
        setLoadState,
        setSubmitResult,
        onSuccess,
      });

      await action();

      expect(onSuccess).toHaveBeenCalledWith(submitResult);
    });
  });

  describe('submitSelectedAnswer', () => {
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

      await submitSelectedAnswer({
        question: null,
        selectedChoiceId: fixtureChoice1Id,
        questionLoadedAtMs: 0,
        submitRequestToken: null,
        createIdempotencyKey: () => 'idem_1',
        setSubmitRequestToken: vi.fn(),
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

      await submitSelectedAnswer({
        question: createQuestionOutput(),
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
        idempotencyKey: 'idem_1',
        timeSpentSeconds: 4,
      });
      expect(setSubmitResult).toHaveBeenCalledWith(
        expect.objectContaining({ isCorrect: true }),
      );
      expect(setLoadState).toHaveBeenCalledWith({ status: 'ready' });
    });

    it('mints an identity-bound idempotency key when no key is preserved', async () => {
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

      await submitSelectedAnswer({
        question: createQuestionOutput(),
        selectedChoiceId: fixtureChoice1Id,
        questionLoadedAtMs: 1000,
        submitRequestToken: null,
        createIdempotencyKey: () => 'idem_1',
        setSubmitRequestToken: vi.fn(),
        submitAnswerFn,
        nowMs: () => 5000,
        setLoadState: vi.fn(),
        setSubmitResult: vi.fn(),
      });

      expect(submitAnswerFn).toHaveBeenCalledWith({
        questionId: fixtureQuestion1Id,
        choiceId: fixtureChoice1Id,
        idempotencyKey: 'idem_1',
        timeSpentSeconds: 4,
      });
    });

    it('passes retry provenance through to submit action payload', async () => {
      const submitAnswerFn = vi.fn(async () =>
        ok({
          attemptId: fixtureAttemptRetry1Id,
          isCorrect: true,
          correctChoiceId: fixtureChoice1Id,
          explanationMd: 'Because...',
          referenceMd: null,
          choiceExplanations: [],
        } satisfies SubmitAnswerOutput),
      );

      await submitSelectedAnswer({
        question: createQuestionOutput(),
        selectedChoiceId: fixtureChoice1Id,
        questionLoadedAtMs: 1000,
        submitRequestToken: null,
        createIdempotencyKey: () => 'idem_1',
        setSubmitRequestToken: vi.fn(),
        retryProvenance: {
          retryOfAttemptId: fixtureAttemptParent1Id,
          retryOrigin: 'history',
          retrySessionId: null,
        },
        submitAnswerFn,
        nowMs: () => 5000,
        setLoadState: vi.fn(),
        setSubmitResult: vi.fn(),
      });

      expect(submitAnswerFn).toHaveBeenCalledWith({
        questionId: fixtureQuestion1Id,
        choiceId: fixtureChoice1Id,
        idempotencyKey: 'idem_1',
        timeSpentSeconds: 4,
        retryOfAttemptId: fixtureAttemptParent1Id,
        retryOrigin: 'history',
      });
    });

    it('passes session review provenance without retryOfAttemptId for unanswered reveals', async () => {
      const submitAnswerFn = vi.fn(async () =>
        ok({
          attemptId: fixtureAttemptRetry2Id,
          isCorrect: true,
          correctChoiceId: fixtureChoice1Id,
          explanationMd: 'Because...',
          referenceMd: null,
          choiceExplanations: [],
        } satisfies SubmitAnswerOutput),
      );

      await submitSelectedAnswer({
        question: createQuestionOutput(),
        selectedChoiceId: fixtureChoice1Id,
        questionLoadedAtMs: 1000,
        submitRequestToken: null,
        createIdempotencyKey: () => 'idem_1',
        setSubmitRequestToken: vi.fn(),
        retryProvenance: {
          retryOfAttemptId: null,
          retryOrigin: 'session_review',
          retrySessionId: fixtureSession1Id,
        },
        submitAnswerFn,
        nowMs: () => 5000,
        setLoadState: vi.fn(),
        setSubmitResult: vi.fn(),
      });

      expect(submitAnswerFn).toHaveBeenCalledWith({
        questionId: fixtureQuestion1Id,
        choiceId: fixtureChoice1Id,
        idempotencyKey: 'idem_1',
        timeSpentSeconds: 4,
        retryOrigin: 'session_review',
        retrySessionId: fixtureSession1Id,
      });
    });

    it('computes timeSpentSeconds when questionLoadedAtMs is 0', async () => {
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

      await submitSelectedAnswer({
        question: createQuestionOutput(),
        selectedChoiceId: fixtureChoice1Id,
        questionLoadedAtMs: 0,
        submitRequestToken: null,
        createIdempotencyKey: () => 'idem_1',
        setSubmitRequestToken: vi.fn(),
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
          attemptId: fixtureAttempt1Id,
          isCorrect: true,
          correctChoiceId: fixtureChoice1Id,
          explanationMd: 'Because...',
          referenceMd: null,
          choiceExplanations: [],
        } satisfies SubmitAnswerOutput),
      );

      await submitSelectedAnswer({
        question: createQuestionOutput(),
        selectedChoiceId: fixtureChoice1Id,
        questionLoadedAtMs: 5000,
        submitRequestToken: null,
        createIdempotencyKey: () => 'idem_1',
        setSubmitRequestToken: vi.fn(),
        submitAnswerFn,
        nowMs: () => 1000,
        setLoadState: vi.fn(),
        setSubmitResult: vi.fn(),
      });

      expect(submitAnswerFn).toHaveBeenCalledWith(
        expect.objectContaining({ timeSpentSeconds: 0 }),
      );
    });

    it('returns error state when submit fails', async () => {
      const submitAnswerFn = vi.fn(async () =>
        err('INTERNAL_ERROR', 'Internal error'),
      );
      const setLoadState = vi.fn();
      const setSubmitRequestToken = vi.fn();

      await submitSelectedAnswer({
        question: createQuestionOutput(),
        selectedChoiceId: fixtureChoice1Id,
        questionLoadedAtMs: null,
        submitRequestToken: null,
        createIdempotencyKey: () => 'idem_1',
        setSubmitRequestToken,
        submitAnswerFn,
        nowMs: () => 0,
        setLoadState,
        setSubmitResult: vi.fn(),
      });

      expect(setLoadState).toHaveBeenCalledWith({
        status: 'error',
        message: 'Internal error',
      });
      expect(setSubmitRequestToken).toHaveBeenCalledTimes(1);
      expect(setSubmitRequestToken).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'idem_1' }),
      );
    });

    it('rotates the submit key after a determinate cached failure', async () => {
      const createIdempotencyKey = vi
        .fn<() => string>()
        .mockReturnValueOnce('idem_1')
        .mockReturnValueOnce('idem_2');
      const setSubmitRequestToken = vi.fn();

      await submitSelectedAnswer({
        question: createQuestionOutput(),
        selectedChoiceId: fixtureChoice1Id,
        questionLoadedAtMs: null,
        submitRequestToken: null,
        createIdempotencyKey,
        setSubmitRequestToken,
        submitAnswerFn: vi.fn(async () =>
          err('NOT_FOUND', 'Question not found'),
        ),
        nowMs: () => 0,
        setLoadState: vi.fn(),
        setSubmitResult: vi.fn(),
      });

      expect(setSubmitRequestToken).toHaveBeenLastCalledWith(
        expect.objectContaining({ key: 'idem_2' }),
      );
    });

    it('ignores stale response when isStale callback returns true', async () => {
      const deferred = createDeferred<ActionResult<SubmitAnswerOutput>>();
      let stale = false;

      const setLoadState = vi.fn();
      const setSubmitResult = vi.fn();

      const promise = submitSelectedAnswer({
        question: createQuestionOutput(),
        selectedChoiceId: fixtureChoice1Id,
        questionLoadedAtMs: 0,
        submitRequestToken: null,
        createIdempotencyKey: () => 'idem_1',
        setSubmitRequestToken: vi.fn(),
        submitAnswerFn: async () => deferred.promise,
        nowMs: () => 1000,
        setLoadState,
        setSubmitResult,
        isMounted: () => true,
        isStale: () => stale,
      });

      stale = true;
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

    it('returns no state updates when unmounted during submitSelectedAnswer', async () => {
      const deferred = createDeferred<ActionResult<SubmitAnswerOutput>>();
      let mounted = true;

      const setLoadState = vi.fn();
      const setSubmitResult = vi.fn();

      const promise = submitSelectedAnswer({
        question: createQuestionOutput(),
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

    it('returns error state when submit throws', async () => {
      const setLoadState = vi.fn();
      const error = new Error('Boom');

      await expect(
        submitSelectedAnswer({
          question: createQuestionOutput(),
          selectedChoiceId: fixtureChoice1Id,
          questionLoadedAtMs: 0,
          submitRequestToken: null,
          createIdempotencyKey: () => 'idem_1',
          setSubmitRequestToken: vi.fn(),
          submitAnswerFn: async () => {
            throw error;
          },
          nowMs: () => 0,
          setLoadState,
          setSubmitResult: vi.fn(),
        }),
      ).resolves.toBeUndefined();

      expect(setLoadState).toHaveBeenCalledWith({
        status: 'error',
        message: 'Boom',
      });
      expect(captureExceptionMock).toHaveBeenCalledWith(error, {
        tags: {
          component: 'QuestionPageLogic',
          action: 'submitSelectedAnswer',
        },
      });
    });
  });

  describe('reattemptQuestion', () => {
    it('clears choice/result and resets loadedAt', () => {
      const setSelectedChoiceId = vi.fn();
      const setSubmitResult = vi.fn();
      const setSubmitRequestToken = vi.fn();
      const setQuestionLoadedAt = vi.fn();
      const setSessionUnansweredReveal = vi.fn();

      reattemptQuestion({
        nowMs: () => 1234,
        setSelectedChoiceId,
        setSubmitResult,
        setSubmitRequestToken,
        setQuestionLoadedAt,
        setSessionUnansweredReveal,
      });

      expect(setSelectedChoiceId).toHaveBeenCalledWith(null);
      expect(setSubmitResult).toHaveBeenCalledWith(null);
      expect(setSubmitRequestToken).toHaveBeenCalledWith(null);
      expect(setQuestionLoadedAt).toHaveBeenCalledWith(1234);
      expect(setSessionUnansweredReveal).toHaveBeenCalledWith(null);
    });
  });
});
