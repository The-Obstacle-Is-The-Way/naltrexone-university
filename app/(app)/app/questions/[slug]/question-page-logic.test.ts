import { describe, expect, it, vi } from 'vitest';
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
    id: 'q_1',
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
  describe('canSubmitQuestionAnswer', () => {
    it('returns false when loadState is loading', () => {
      expect(
        canSubmitQuestionAnswer({
          loadState: { status: 'loading' },
          question: createQuestionOutput(),
          selectedChoiceId: 'choice_1',
          submitResult: null,
        }),
      ).toBe(false);
    });

    it('returns true when question is loaded, a choice is selected, and no submit result exists', () => {
      expect(
        canSubmitQuestionAnswer({
          loadState: { status: 'ready' },
          question: createQuestionOutput(),
          selectedChoiceId: 'choice_1',
          submitResult: null,
        }),
      ).toBe(true);
    });

    it('returns false when question is null', () => {
      expect(
        canSubmitQuestionAnswer({
          loadState: { status: 'ready' },
          question: null,
          selectedChoiceId: 'choice_1',
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
          selectedChoiceId: 'choice_1',
          submitResult: {
            attemptId: 'attempt_1',
            isCorrect: true,
            correctChoiceId: 'choice_1',
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
          selectedChoiceId: 'choice_1',
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
          attemptId: 'attempt-1',
        }),
      ).toEqual({
        attemptId: 'attempt-1',
        sessionId: undefined,
        normalized: false,
      });
    });

    it('prefers sessionId when both attemptId and sessionId are provided in review mode', () => {
      expect(
        normalizeReviewIdentifiers({
          mode: 'review',
          sessionId: 'session-1',
          attemptId: 'attempt-1',
        }),
      ).toEqual({
        attemptId: undefined,
        sessionId: 'session-1',
        normalized: true,
      });
    });
  });

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
        getQuestionBySlugFn: async () => ok(createQuestionOutput()),
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

    it('returns no state updates when unmounted during loadQuestion', async () => {
      const deferred = createDeferred<ActionResult<GetQuestionBySlugOutput>>();
      let mounted = true;

      const setLoadState = vi.fn();
      const setSelectedChoiceId = vi.fn();
      const setSubmitResult = vi.fn();
      const setSubmitIdempotencyKey = vi.fn();
      const setQuestionLoadedAt = vi.fn();
      const setQuestion = vi.fn();

      const promise = loadQuestion({
        slug: 'q-1',
        getQuestionBySlugFn: async () => deferred.promise,
        createIdempotencyKey: () => 'idem_1',
        nowMs: () => 1234,
        setLoadState,
        setSelectedChoiceId,
        setSubmitResult,
        setSubmitIdempotencyKey,
        setQuestionLoadedAt,
        setQuestion,
        isMounted: () => mounted,
      });

      mounted = false;
      deferred.resolve(ok(createQuestionOutput()));
      await promise;

      expect(setQuestion).not.toHaveBeenCalled();
      expect(setQuestionLoadedAt).not.toHaveBeenCalledWith(1234);
      expect(setSubmitIdempotencyKey).not.toHaveBeenCalledWith('idem_1');
      expect(setLoadState).not.toHaveBeenCalledWith({ status: 'ready' });
    });

    it('returns error state when controller throws', async () => {
      const setLoadState = vi.fn();
      const setQuestion = vi.fn();

      await expect(
        loadQuestion({
          slug: 'q-1',
          getQuestionBySlugFn: async () => {
            throw new Error('Boom');
          },
          createIdempotencyKey: () => 'idem_1',
          nowMs: () => 1234,
          setLoadState,
          setSelectedChoiceId: vi.fn(),
          setSubmitResult: vi.fn(),
          setSubmitIdempotencyKey: vi.fn(),
          setQuestionLoadedAt: vi.fn(),
          setQuestion,
        }),
      ).resolves.toBeUndefined();

      expect(setQuestion).toHaveBeenCalledWith(null);
      expect(setLoadState).toHaveBeenCalledWith({
        status: 'error',
        message: 'Boom',
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

  describe('createSubmitSelectedAnswerAction', () => {
    it('runs submit inside startTransition', async () => {
      const startTransition = vi.fn((fn: () => void) => fn());
      const setLoadState = vi.fn();
      const setSubmitResult = vi.fn();
      const submitResult = {
        attemptId: 'attempt_1',
        isCorrect: true,
        correctChoiceId: 'choice_1',
        explanationMd: null,
        referenceMd: null,
        choiceExplanations: [],
      } satisfies SubmitAnswerOutput;

      const action = createSubmitSelectedAnswerAction({
        startTransition,
        question: createQuestionOutput(),
        selectedChoiceId: 'choice_1',
        questionLoadedAtMs: 0,
        submitIdempotencyKey: 'idem_1',
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
  });

  describe('loadPreviousAttempt', () => {
    it('normalizes mixed attemptId/sessionId by preferring sessionId before hydration fetch', async () => {
      const getPreviousAttemptFn = vi.fn(async () => ok(null));

      await loadPreviousAttempt({
        questionId: 'q_1',
        attemptId: '00000000-0000-4000-8000-000000000001',
        sessionId: '00000000-0000-4000-8000-000000000002',
        getPreviousAttemptFn,
        setSelectedChoiceId: vi.fn(),
        setSubmitResult: vi.fn(),
      });

      expect(getPreviousAttemptFn).toHaveBeenCalledWith({
        questionId: 'q_1',
        sessionId: '00000000-0000-4000-8000-000000000002',
      });
    });

    it('sets selectedChoiceId and submitResult when previous attempt exists', async () => {
      const setSelectedChoiceId = vi.fn();
      const setSubmitResult = vi.fn();
      const setReviewHydrationState = vi.fn();

      await loadPreviousAttempt({
        questionId: 'q_1',
        getPreviousAttemptFn: async () =>
          ok({
            kind: 'attempt',
            attemptId: 'attempt_1',
            selectedChoiceId: 'choice_1',
            isCorrect: false,
            correctChoiceId: 'choice_2',
            explanationMd: 'Explanation',
            referenceMd: 'Anton RF et al. JAMA. 2006;295(17):2003-2017.',
            choiceExplanations: [],
            answeredAt: '2026-02-01T00:00:00.000Z',
          } satisfies GetPreviousAttemptOutput),
        setSelectedChoiceId,
        setSubmitResult,
        setReviewHydrationState,
      });

      expect(setSelectedChoiceId).toHaveBeenCalledWith('choice_1');
      expect(setSubmitResult).toHaveBeenCalledWith({
        attemptId: 'attempt_1',
        isCorrect: false,
        correctChoiceId: 'choice_2',
        explanationMd: 'Explanation',
        referenceMd: 'Anton RF et al. JAMA. 2006;295(17):2003-2017.',
        choiceExplanations: [],
      } satisfies SubmitAnswerOutput);
      expect(setReviewHydrationState).toHaveBeenCalledWith('attempt');
    });

    it('maps kind=session_unanswered to sessionUnansweredReveal without submitResult', async () => {
      const setSelectedChoiceId = vi.fn();
      const setSubmitResult = vi.fn();
      const setSessionUnansweredReveal = vi.fn();
      const setReviewHydrationState = vi.fn();

      await loadPreviousAttempt({
        questionId: 'q_1',
        sessionId: '00000000-0000-4000-8000-000000000002',
        getPreviousAttemptFn: async () =>
          ok({
            kind: 'session_unanswered',
            correctChoiceId: 'choice_2',
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
        correctChoiceId: 'choice_2',
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
        questionId: 'q_1',
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
        questionId: 'q_1',
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

      await loadPreviousAttempt({
        questionId: 'q_1',
        getPreviousAttemptFn: async () => {
          throw new Error('Boom');
        },
        setSelectedChoiceId,
        setSubmitResult,
        setReviewHydrationState,
      });

      expect(setSelectedChoiceId).not.toHaveBeenCalled();
      expect(setSubmitResult).not.toHaveBeenCalled();
      expect(setReviewHydrationState).toHaveBeenCalledWith('hydration_error');
    });

    it('marks hydration_error when previous-attempt request times out', async () => {
      vi.useFakeTimers();
      try {
        const setSelectedChoiceId = vi.fn();
        const setSubmitResult = vi.fn();
        const setReviewHydrationState = vi.fn();

        const promise = loadPreviousAttempt({
          questionId: 'q_1',
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
      } finally {
        vi.useRealTimers();
      }
    });

    it('marks hydration_error when previous-attempt response is undefined (mock reset edge case)', async () => {
      const setSelectedChoiceId = vi.fn();
      const setSubmitResult = vi.fn();
      const setReviewHydrationState = vi.fn();

      await loadPreviousAttempt({
        questionId: 'q_1',
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
        questionId: 'q_1',
        getPreviousAttemptFn: async () =>
          ok({
            kind: 'attempt',
            attemptId: 'attempt_1',
            selectedChoiceId: 'choice_1',
            isCorrect: true,
            correctChoiceId: 'choice_1',
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
          attemptId: 'attempt_1',
          isCorrect: true,
          correctChoiceId: 'choice_1',
          explanationMd: 'Because...',
          referenceMd: null,
          choiceExplanations: [],
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
          referenceMd: null,
          choiceExplanations: [],
        } satisfies SubmitAnswerOutput),
      );

      const setLoadState = vi.fn();
      const setSubmitResult = vi.fn();

      await submitSelectedAnswer({
        question: createQuestionOutput(),
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

    it('passes retry provenance through to submit action payload', async () => {
      const submitAnswerFn = vi.fn(async () =>
        ok({
          attemptId: 'attempt_retry_1',
          isCorrect: true,
          correctChoiceId: 'choice_1',
          explanationMd: 'Because...',
          referenceMd: null,
          choiceExplanations: [],
        } satisfies SubmitAnswerOutput),
      );

      await submitSelectedAnswer({
        question: createQuestionOutput(),
        selectedChoiceId: 'choice_1',
        questionLoadedAtMs: 1000,
        submitIdempotencyKey: 'idem_1',
        retryProvenance: {
          retryOfAttemptId: 'attempt_parent_1',
          retryOrigin: 'history',
          retrySessionId: null,
        },
        submitAnswerFn,
        nowMs: () => 5000,
        setLoadState: vi.fn(),
        setSubmitResult: vi.fn(),
      });

      expect(submitAnswerFn).toHaveBeenCalledWith({
        questionId: 'q_1',
        choiceId: 'choice_1',
        idempotencyKey: 'idem_1',
        timeSpentSeconds: 4,
        retryOfAttemptId: 'attempt_parent_1',
        retryOrigin: 'history',
      });
    });

    it('passes session review provenance without retryOfAttemptId for unanswered reveals', async () => {
      const submitAnswerFn = vi.fn(async () =>
        ok({
          attemptId: 'attempt_retry_2',
          isCorrect: true,
          correctChoiceId: 'choice_1',
          explanationMd: 'Because...',
          referenceMd: null,
          choiceExplanations: [],
        } satisfies SubmitAnswerOutput),
      );

      await submitSelectedAnswer({
        question: createQuestionOutput(),
        selectedChoiceId: 'choice_1',
        questionLoadedAtMs: 1000,
        submitIdempotencyKey: 'idem_1',
        retryProvenance: {
          retryOfAttemptId: null,
          retryOrigin: 'session_review',
          retrySessionId: 'session_1',
        },
        submitAnswerFn,
        nowMs: () => 5000,
        setLoadState: vi.fn(),
        setSubmitResult: vi.fn(),
      });

      expect(submitAnswerFn).toHaveBeenCalledWith({
        questionId: 'q_1',
        choiceId: 'choice_1',
        idempotencyKey: 'idem_1',
        timeSpentSeconds: 4,
        retryOrigin: 'session_review',
        retrySessionId: 'session_1',
      });
    });

    it('computes timeSpentSeconds when questionLoadedAtMs is 0', async () => {
      const submitAnswerFn = vi.fn(async () =>
        ok({
          attemptId: 'attempt_1',
          isCorrect: true,
          correctChoiceId: 'choice_1',
          explanationMd: 'Because...',
          referenceMd: null,
          choiceExplanations: [],
        } satisfies SubmitAnswerOutput),
      );

      await submitSelectedAnswer({
        question: createQuestionOutput(),
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
          referenceMd: null,
          choiceExplanations: [],
        } satisfies SubmitAnswerOutput),
      );

      await submitSelectedAnswer({
        question: createQuestionOutput(),
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

    it('returns error state when submit fails', async () => {
      const submitAnswerFn = vi.fn(async () =>
        err('INTERNAL_ERROR', 'Internal error'),
      );
      const setLoadState = vi.fn();

      await submitSelectedAnswer({
        question: createQuestionOutput(),
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

    it('returns no state updates when unmounted during submitSelectedAnswer', async () => {
      const deferred = createDeferred<ActionResult<SubmitAnswerOutput>>();
      let mounted = true;

      const setLoadState = vi.fn();
      const setSubmitResult = vi.fn();

      const promise = submitSelectedAnswer({
        question: createQuestionOutput(),
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

      await expect(
        submitSelectedAnswer({
          question: createQuestionOutput(),
          selectedChoiceId: 'choice_1',
          questionLoadedAtMs: 0,
          submitIdempotencyKey: 'idem_1',
          submitAnswerFn: async () => {
            throw new Error('Boom');
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
    });
  });

  describe('reattemptQuestion', () => {
    it('clears choice/result and resets loadedAt', () => {
      const setSelectedChoiceId = vi.fn();
      const setSubmitResult = vi.fn();
      const setSubmitIdempotencyKey = vi.fn();
      const setQuestionLoadedAt = vi.fn();
      const setSessionUnansweredReveal = vi.fn();

      reattemptQuestion({
        createIdempotencyKey: () => 'idem_1',
        nowMs: () => 1234,
        setSelectedChoiceId,
        setSubmitResult,
        setSubmitIdempotencyKey,
        setQuestionLoadedAt,
        setSessionUnansweredReveal,
      });

      expect(setSelectedChoiceId).toHaveBeenCalledWith(null);
      expect(setSubmitResult).toHaveBeenCalledWith(null);
      expect(setSubmitIdempotencyKey).toHaveBeenCalledWith('idem_1');
      expect(setQuestionLoadedAt).toHaveBeenCalledWith(1234);
      expect(setSessionUnansweredReveal).toHaveBeenCalledWith(null);
    });
  });
});
