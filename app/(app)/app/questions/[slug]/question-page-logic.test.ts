import { afterEach, describe, expect, it, vi } from 'vitest';

const fixtureAttempt1Id2 = crypto.randomUUID();
const fixtureQuestion1Id = crypto.randomUUID();
const fixtureSession1Id2 = crypto.randomUUID();

const { captureExceptionMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: captureExceptionMock,
}));

import {
  createLoadQuestionAction,
  loadQuestion,
  normalizeReviewIdentifiers,
} from '@/app/(app)/app/questions/[slug]/question-page-logic';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { err, ok } from '@/src/adapters/controllers/action-result';
import type { GetQuestionBySlugOutput } from '@/src/adapters/controllers/question-view-controller';
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
        expect(captureExceptionMock).toHaveBeenCalledWith(expect.any(Error), {
          tags: {
            component: 'QuestionPageLogic',
            action: 'loadQuestion',
          },
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
      expect(captureExceptionMock).toHaveBeenCalledWith(error, {
        tags: {
          component: 'QuestionPageLogic',
          action: 'loadQuestion',
        },
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
});
