import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  fixtureAttempt1Id,
  fixtureAttempt1Id2,
  fixtureAttemptParent1Id,
  fixtureAttemptRetry1Id,
  fixtureAttemptRetry2Id,
  fixtureChoice1Id,
  fixtureChoice2Id,
  fixtureQuestion1Id,
  fixtureSession1Id,
  fixtureSession1Id2,
} = vi.hoisted(() => ({
  fixtureAttempt1Id: crypto.randomUUID(),
  fixtureAttempt1Id2: crypto.randomUUID(),
  fixtureAttemptParent1Id: crypto.randomUUID(),
  fixtureAttemptRetry1Id: crypto.randomUUID(),
  fixtureAttemptRetry2Id: crypto.randomUUID(),
  fixtureChoice1Id: crypto.randomUUID(),
  fixtureChoice2Id: crypto.randomUUID(),
  fixtureQuestion1Id: crypto.randomUUID(),
  fixtureSession1Id: crypto.randomUUID(),
  fixtureSession1Id2: crypto.randomUUID(),
}));

const { reportClientErrorMock } = vi.hoisted(() => ({
  reportClientErrorMock: vi.fn(),
}));

vi.mock('@/lib/report-client-error', () => ({
  reportClientError: reportClientErrorMock,
}));

import type { QuestionPageSubmitResult } from '@/app/(app)/app/questions/[slug]/question-page-logic';
import {
  canSubmitQuestionAnswer,
  createLoadQuestionAction,
  createSubmitSelectedAnswerAction,
  loadPreviousAttempt,
  loadQuestion,
  normalizeReviewIdentifiers,
  reattemptQuestion,
  submitSelectedAnswer,
} from '@/app/(app)/app/questions/[slug]/question-page-logic';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { err, ok } from '@/src/adapters/controllers/action-result';
import type { GetQuestionBySlugOutput } from '@/src/adapters/controllers/question-view-controller';
import type { GetPreviousAttemptOutput } from '@/src/application/use-cases/get-previous-attempt';
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
    reportClientErrorMock.mockReset();
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

  describe('normalizeReviewIdentifiers', () => {
    it('keeps attemptId when sessionId is absent', () => {
      expect(
        normalizeReviewIdentifiers({
          mode: 'review',
          attemptId: fixtureAttempt1Id2,
        }),
      ).toEqual({
        attemptId: fixtureAttempt1Id2,
        sessionId: undefined,
        normalized: false,
      });
    });

    it('prefers sessionId when both attemptId and sessionId are provided in review mode', () => {
      expect(
        normalizeReviewIdentifiers({
          mode: 'review',
          sessionId: fixtureSession1Id2,
          attemptId: fixtureAttempt1Id2,
        }),
      ).toEqual({
        attemptId: undefined,
        sessionId: fixtureSession1Id2,
        normalized: true,
      });
    });
  });

  describe('loadQuestion', () => {
    it('loads question and resets state on success', async () => {
      const setLoadState = vi.fn();
      const setSelectedChoiceId = vi.fn();
      const setSubmitResult = vi.fn();
      const setSubmitRequestToken = vi.fn();
      const setQuestionLoadedAt = vi.fn();
      const setQuestion = vi.fn();

      await loadQuestion({
        slug: 'q-1',
        getQuestionBySlugFn: async () => ok(createQuestionOutput()),
        nowMs: () => 1234,
        setLoadState,
        setSelectedChoiceId,
        setSubmitResult,
        setSubmitRequestToken,
        setQuestionLoadedAt,
        setQuestion,
      });

      expect(setLoadState).toHaveBeenCalledWith({ status: 'loading' });
      expect(setSelectedChoiceId).toHaveBeenCalledWith(null);
      expect(setSubmitResult).toHaveBeenCalledWith(null);
      expect(setSubmitRequestToken).toHaveBeenCalledWith(null);
      expect(setQuestionLoadedAt).toHaveBeenCalledWith(null);

      expect(setQuestion).toHaveBeenCalledWith(
        expect.objectContaining({ questionId: fixtureQuestion1Id }),
      );
      expect(setQuestionLoadedAt).toHaveBeenCalledWith(1234);
      expect(setSubmitRequestToken).toHaveBeenLastCalledWith(null);
      expect(setLoadState).toHaveBeenCalledWith({ status: 'ready' });
    });

    it('sets error state and clears question on failure', async () => {
      const setLoadState = vi.fn();
      const setSelectedChoiceId = vi.fn();
      const setSubmitResult = vi.fn();
      const setSubmitRequestToken = vi.fn();
      const setQuestionLoadedAt = vi.fn();
      const setQuestion = vi.fn();

      await loadQuestion({
        slug: 'q-1',
        getQuestionBySlugFn: async () => err('NOT_FOUND', 'Question not found'),
        nowMs: () => 1234,
        setLoadState,
        setSelectedChoiceId,
        setSubmitResult,
        setSubmitRequestToken,
        setQuestionLoadedAt,
        setQuestion,
      });

      expect(setQuestion).toHaveBeenCalledWith(null);
      expect(setLoadState).toHaveBeenCalledWith({
        status: 'error',
        message: 'Question not found',
      });
    });

    it('uses the standard read timeout tier when loading a question', async () => {
      vi.useFakeTimers();
      try {
        const setLoadState = vi.fn();
        const setSelectedChoiceId = vi.fn();
        const setSubmitResult = vi.fn();
        const setSubmitRequestToken = vi.fn();
        const setQuestionLoadedAt = vi.fn();
        const setQuestion = vi.fn();

        const promise = loadQuestion({
          slug: 'q-1',
          getQuestionBySlugFn: async () => new Promise<never>(() => {}),
          nowMs: () => 1234,
          setLoadState,
          setSelectedChoiceId,
          setSubmitResult,
          setSubmitRequestToken,
          setQuestionLoadedAt,
          setQuestion,
        });

        await vi.advanceTimersByTimeAsync(10_000);
        await promise;

        expect(setQuestion).toHaveBeenCalledWith(null);
        expect(setLoadState).toHaveBeenCalledWith({
          status: 'error',
          message: 'Request timed out. Please try again.',
        });
        expect(reportClientErrorMock).toHaveBeenCalledWith(expect.any(Error), {
          component: 'QuestionPageLogic',
          action: 'loadQuestion',
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it('returns no state updates when unmounted during loadQuestion', async () => {
      const deferred = createDeferred<ActionResult<GetQuestionBySlugOutput>>();
      let mounted = true;

      const setLoadState = vi.fn();
      const setSelectedChoiceId = vi.fn();
      const setSubmitResult = vi.fn();
      const setSubmitRequestToken = vi.fn();
      const setQuestionLoadedAt = vi.fn();
      const setQuestion = vi.fn();

      const promise = loadQuestion({
        slug: 'q-1',
        getQuestionBySlugFn: async () => deferred.promise,
        nowMs: () => 1234,
        setLoadState,
        setSelectedChoiceId,
        setSubmitResult,
        setSubmitRequestToken,
        setQuestionLoadedAt,
        setQuestion,
        isMounted: () => mounted,
      });

      mounted = false;
      deferred.resolve(ok(createQuestionOutput()));
      await promise;

      expect(setQuestion).not.toHaveBeenCalled();
      expect(setQuestionLoadedAt).not.toHaveBeenCalledWith(1234);
      expect(setSubmitRequestToken).toHaveBeenCalledTimes(1);
      expect(setLoadState).not.toHaveBeenCalledWith({ status: 'ready' });
    });

    it('ignores stale response when isStale callback returns true', async () => {
      const deferred = createDeferred<ActionResult<GetQuestionBySlugOutput>>();
      let stale = false;

      const setLoadState = vi.fn();
      const setQuestion = vi.fn();
      const setQuestionLoadedAt = vi.fn();
      const setSubmitRequestToken = vi.fn();

      const promise = loadQuestion({
        slug: 'q-1',
        getQuestionBySlugFn: async () => deferred.promise,
        nowMs: () => 1234,
        setLoadState,
        setSelectedChoiceId: vi.fn(),
        setSubmitResult: vi.fn(),
        setSubmitRequestToken,
        setQuestionLoadedAt,
        setQuestion,
        isMounted: () => true,
        isStale: () => stale,
      });

      stale = true;
      deferred.resolve(ok(createQuestionOutput()));
      await promise;

      expect(setQuestion).not.toHaveBeenCalled();
      expect(setQuestionLoadedAt).not.toHaveBeenCalledWith(1234);
      expect(setSubmitRequestToken).toHaveBeenCalledTimes(1);
      expect(setLoadState).not.toHaveBeenCalledWith({ status: 'ready' });
    });

    it('returns error state when controller throws', async () => {
      const setLoadState = vi.fn();
      const setQuestion = vi.fn();
      const error = new Error('Boom');

      await expect(
        loadQuestion({
          slug: 'q-1',
          getQuestionBySlugFn: async () => {
            throw error;
          },
          nowMs: () => 1234,
          setLoadState,
          setSelectedChoiceId: vi.fn(),
          setSubmitResult: vi.fn(),
          setSubmitRequestToken: vi.fn(),
          setQuestionLoadedAt: vi.fn(),
          setQuestion,
        }),
      ).resolves.toBeUndefined();

      expect(setQuestion).toHaveBeenCalledWith(null);
      expect(setLoadState).toHaveBeenCalledWith({
        status: 'error',
        message: 'Boom',
      });
      expect(reportClientErrorMock).toHaveBeenCalledWith(error, {
        component: 'QuestionPageLogic',
        action: 'loadQuestion',
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
        getQuestionBySlugFn: async () => ok(createQuestionOutput()),
        nowMs: () => 1234,
        setLoadState,
        setSelectedChoiceId: vi.fn(),
        setSubmitResult: vi.fn(),
        setSubmitRequestToken: vi.fn(),
        setQuestionLoadedAt: vi.fn(),
        setQuestion: vi.fn(),
      });

      action();

      expect(startTransition).toHaveBeenCalledTimes(1);
      expect(setLoadState).toHaveBeenCalledWith({ status: 'loading' });
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

  describe('loadPreviousAttempt', () => {
    it('normalizes mixed attemptId/sessionId by preferring sessionId before hydration fetch', async () => {
      const getPreviousAttemptFn = vi.fn(async () => ok(null));

      await loadPreviousAttempt({
        questionId: fixtureQuestion1Id,
        attemptId: '00000000-0000-4000-8000-000000000001',
        sessionId: '00000000-0000-4000-8000-000000000002',
        getPreviousAttemptFn,
        setSelectedChoiceId: vi.fn(),
        setSubmitResult: vi.fn(),
      });

      expect(getPreviousAttemptFn).toHaveBeenCalledWith({
        questionId: fixtureQuestion1Id,
        sessionId: '00000000-0000-4000-8000-000000000002',
      });
    });

    it('sets selectedChoiceId and submitResult when previous attempt exists', async () => {
      const setSelectedChoiceId = vi.fn();
      const setSubmitResult = vi.fn();
      const setReviewSessionMode = vi.fn();
      const setReviewHydrationState = vi.fn();

      await loadPreviousAttempt({
        questionId: fixtureQuestion1Id,
        getPreviousAttemptFn: async () =>
          ok({
            kind: 'attempt',
            attemptId: fixtureAttempt1Id,
            sessionMode: 'exam',
            selectedChoiceId: fixtureChoice1Id,
            isOmitted: false,
            isCorrect: false,
            correctChoiceId: fixtureChoice2Id,
            explanationMd: 'Explanation',
            referenceMd: 'Anton RF et al. JAMA. 2006;295(17):2003-2017.',
            choiceExplanations: [],
            answeredAt: '2026-02-01T00:00:00.000Z',
          } satisfies GetPreviousAttemptOutput),
        setSelectedChoiceId,
        setSubmitResult,
        setReviewSessionMode,
        setReviewHydrationState,
      });

      expect(setReviewSessionMode).toHaveBeenCalledWith('exam');
      expect(setSelectedChoiceId).toHaveBeenCalledWith(fixtureChoice1Id);
      expect(setSubmitResult).toHaveBeenCalledWith({
        attemptId: fixtureAttempt1Id,
        isOmitted: false,
        isCorrect: false,
        correctChoiceId: fixtureChoice2Id,
        explanationMd: 'Explanation',
        referenceMd: 'Anton RF et al. JAMA. 2006;295(17):2003-2017.',
        choiceExplanations: [],
      } satisfies QuestionPageSubmitResult);
      expect(setReviewHydrationState).toHaveBeenCalledWith('attempt');
    });

    it('maps kind=session_unanswered to sessionUnansweredReveal without submitResult', async () => {
      const setSelectedChoiceId = vi.fn();
      const setSubmitResult = vi.fn();
      const setSessionUnansweredReveal = vi.fn();
      const setReviewHydrationState = vi.fn();

      await loadPreviousAttempt({
        questionId: fixtureQuestion1Id,
        sessionId: '00000000-0000-4000-8000-000000000002',
        getPreviousAttemptFn: async () =>
          ok({
            kind: 'session_unanswered',
            sessionMode: 'tutor',
            correctChoiceId: fixtureChoice2Id,
            explanationMd: 'Explanation',
            referenceMd: 'Anton RF et al. JAMA. 2006;295(17):2003-2017.',
            choiceExplanations: [],
          } satisfies GetPreviousAttemptOutput),
        setSelectedChoiceId,
        setSubmitResult,
        setSessionUnansweredReveal,
        setReviewHydrationState,
      });

      expect(setSessionUnansweredReveal).toHaveBeenLastCalledWith({
        sessionMode: 'tutor',
        correctChoiceId: fixtureChoice2Id,
        explanationMd: 'Explanation',
        referenceMd: 'Anton RF et al. JAMA. 2006;295(17):2003-2017.',
        choiceExplanations: [],
      });
      expect(setSubmitResult).toHaveBeenCalledWith(null);
      expect(setSelectedChoiceId).toHaveBeenCalledWith(null);
      expect(setReviewHydrationState).toHaveBeenCalledWith(
        'session_unanswered',
      );
    });

    it('marks no_prior_attempt when previous attempt returns null', async () => {
      const setSelectedChoiceId = vi.fn();
      const setSubmitResult = vi.fn();
      const setReviewHydrationState = vi.fn();

      await loadPreviousAttempt({
        questionId: fixtureQuestion1Id,
        getPreviousAttemptFn: async () => ok(null),
        setSelectedChoiceId,
        setSubmitResult,
        setReviewHydrationState,
      });

      expect(setSelectedChoiceId).not.toHaveBeenCalled();
      expect(setSubmitResult).not.toHaveBeenCalled();
      expect(setReviewHydrationState).toHaveBeenCalledWith('no_prior_attempt');
    });

    it('marks hydration_error when server action returns error', async () => {
      const setSelectedChoiceId = vi.fn();
      const setSubmitResult = vi.fn();
      const setReviewHydrationState = vi.fn();

      await loadPreviousAttempt({
        questionId: fixtureQuestion1Id,
        getPreviousAttemptFn: async () =>
          err('INTERNAL_ERROR', 'Internal error'),
        setSelectedChoiceId,
        setSubmitResult,
        setReviewHydrationState,
      });

      expect(setSelectedChoiceId).not.toHaveBeenCalled();
      expect(setSubmitResult).not.toHaveBeenCalled();
      expect(setReviewHydrationState).toHaveBeenCalledWith('hydration_error');
    });

    it('marks hydration_error when server action throws', async () => {
      const setSelectedChoiceId = vi.fn();
      const setSubmitResult = vi.fn();
      const setReviewHydrationState = vi.fn();
      const error = new Error('Boom');

      await loadPreviousAttempt({
        questionId: fixtureQuestion1Id,
        getPreviousAttemptFn: async () => {
          throw error;
        },
        setSelectedChoiceId,
        setSubmitResult,
        setReviewHydrationState,
      });

      expect(setSelectedChoiceId).not.toHaveBeenCalled();
      expect(setSubmitResult).not.toHaveBeenCalled();
      expect(setReviewHydrationState).toHaveBeenCalledWith('hydration_error');
      expect(reportClientErrorMock).toHaveBeenCalledWith(error, {
        component: 'QuestionPageLogic',
        action: 'loadPreviousAttempt',
      });
    });

    it('ignores stale response when isStale callback returns true', async () => {
      const deferred =
        createDeferred<ActionResult<GetPreviousAttemptOutput | null>>();
      let stale = false;

      const setSelectedChoiceId = vi.fn();
      const setSubmitResult = vi.fn();
      const setReviewHydrationState = vi.fn();

      const promise = loadPreviousAttempt({
        questionId: fixtureQuestion1Id,
        getPreviousAttemptFn: async () => deferred.promise,
        setSelectedChoiceId,
        setSubmitResult,
        setReviewHydrationState,
        isMounted: () => true,
        isStale: () => stale,
      });

      stale = true;
      deferred.resolve(
        ok({
          kind: 'attempt',
          attemptId: fixtureAttempt1Id,
          sessionMode: null,
          selectedChoiceId: fixtureChoice1Id,
          isOmitted: false,
          isCorrect: true,
          correctChoiceId: fixtureChoice1Id,
          explanationMd: 'Explanation',
          referenceMd: null,
          choiceExplanations: [],
          answeredAt: '2026-02-01T00:00:00.000Z',
        } satisfies GetPreviousAttemptOutput),
      );
      await promise;

      expect(setSelectedChoiceId).not.toHaveBeenCalled();
      expect(setSubmitResult).not.toHaveBeenCalled();
      expect(setReviewHydrationState).not.toHaveBeenCalled();
    });

    it('does not set hydration_error when unmounted after previous-attempt request starts and then throws', async () => {
      const setSelectedChoiceId = vi.fn();
      const setSubmitResult = vi.fn();
      const setReviewHydrationState = vi.fn();
      const deferred = createDeferred<ActionResult<GetPreviousAttemptOutput>>();
      let mounted = true;

      const promise = loadPreviousAttempt({
        questionId: fixtureQuestion1Id,
        getPreviousAttemptFn: async () => deferred.promise,
        setSelectedChoiceId,
        setSubmitResult,
        setReviewHydrationState,
        isMounted: () => mounted,
      });
      mounted = false;
      deferred.reject(new Error('Boom'));
      await promise;

      expect(setSelectedChoiceId).not.toHaveBeenCalled();
      expect(setSubmitResult).not.toHaveBeenCalled();
      expect(setReviewHydrationState).not.toHaveBeenCalled();
    });

    it('marks hydration_error when previous-attempt request times out', async () => {
      vi.useFakeTimers();
      try {
        const setSelectedChoiceId = vi.fn();
        const setSubmitResult = vi.fn();
        const setReviewHydrationState = vi.fn();

        const promise = loadPreviousAttempt({
          questionId: fixtureQuestion1Id,
          getPreviousAttemptFn: async () => new Promise<never>(() => {}),
          setSelectedChoiceId,
          setSubmitResult,
          setReviewHydrationState,
        });

        await vi.advanceTimersByTimeAsync(10_000);
        await promise;

        expect(setSelectedChoiceId).not.toHaveBeenCalled();
        expect(setSubmitResult).not.toHaveBeenCalled();
        expect(setReviewHydrationState).toHaveBeenCalledWith('hydration_error');
        expect(reportClientErrorMock).toHaveBeenCalledWith(expect.any(Error), {
          component: 'QuestionPageLogic',
          action: 'loadPreviousAttempt',
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it('marks hydration_error when previous-attempt response is undefined (mock reset edge case)', async () => {
      const setSelectedChoiceId = vi.fn();
      const setSubmitResult = vi.fn();
      const setReviewHydrationState = vi.fn();

      await loadPreviousAttempt({
        questionId: fixtureQuestion1Id,
        getPreviousAttemptFn: async () => undefined as never,
        setSelectedChoiceId,
        setSubmitResult,
        setReviewHydrationState,
      });

      expect(setSelectedChoiceId).not.toHaveBeenCalled();
      expect(setSubmitResult).not.toHaveBeenCalled();
      expect(setReviewHydrationState).toHaveBeenCalledWith('hydration_error');
    });

    it('does not set state when component is unmounted', async () => {
      const setSelectedChoiceId = vi.fn();
      const setSubmitResult = vi.fn();

      await loadPreviousAttempt({
        questionId: fixtureQuestion1Id,
        getPreviousAttemptFn: async () =>
          ok({
            kind: 'attempt',
            attemptId: fixtureAttempt1Id,
            sessionMode: null,
            selectedChoiceId: fixtureChoice1Id,
            isOmitted: false,
            isCorrect: true,
            correctChoiceId: fixtureChoice1Id,
            explanationMd: 'Explanation',
            referenceMd: null,
            choiceExplanations: [],
            answeredAt: '2026-02-01T00:00:00.000Z',
          } satisfies GetPreviousAttemptOutput),
        setSelectedChoiceId,
        setSubmitResult,
        isMounted: () => false,
      });

      expect(setSelectedChoiceId).not.toHaveBeenCalled();
      expect(setSubmitResult).not.toHaveBeenCalled();
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
      expect(reportClientErrorMock).toHaveBeenCalledWith(error, {
        component: 'QuestionPageLogic',
        action: 'submitSelectedAnswer',
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
