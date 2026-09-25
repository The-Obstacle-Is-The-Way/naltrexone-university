import { afterEach, describe, expect, it, vi } from 'vitest';

const fixtureAttempt1Id = crypto.randomUUID();
const fixtureChoice1Id = crypto.randomUUID();
const fixtureChoice2Id = crypto.randomUUID();
const fixtureQuestion1Id = crypto.randomUUID();

const { captureExceptionMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: captureExceptionMock,
}));

import type { QuestionPageSubmitResult } from '@/app/(app)/app/questions/[slug]/question-page-logic';
import { loadPreviousAttempt } from '@/app/(app)/app/questions/[slug]/question-page-logic';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { err, ok } from '@/src/adapters/controllers/action-result';
import type { GetPreviousAttemptOutput } from '@/src/application/use-cases/get-previous-attempt';
import { createDeferred } from '@/tests/test-helpers/create-deferred';

describe('question-page-logic', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    captureExceptionMock.mockReset();
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
      expect(captureExceptionMock).toHaveBeenCalledWith(error, {
        tags: {
          component: 'QuestionPageLogic',
          action: 'loadPreviousAttempt',
        },
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
        expect(captureExceptionMock).toHaveBeenCalledWith(expect.any(Error), {
          tags: {
            component: 'QuestionPageLogic',
            action: 'loadPreviousAttempt',
          },
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
});
