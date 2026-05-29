import { describe, expect, it, vi } from 'vitest';
import {
  createLoadNextQuestionAction,
  loadNextQuestion,
} from '@/app/(app)/app/practice/practice-page-logic';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { err, ok } from '@/src/adapters/controllers/action-result';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import { createDeferred } from '@/tests/test-helpers/create-deferred';

const { fixtureQuestion1Id, fixtureQuestion2Id, fixtureChoice1Id } = vi.hoisted(
  () => ({
    fixtureQuestion1Id: crypto.randomUUID(),
    fixtureQuestion2Id: crypto.randomUUID(),
    fixtureChoice1Id: crypto.randomUUID(),
  }),
);

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

describe('practice-page-logic loading', () => {
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
      const setLoadState = vi.fn();

      const createRequestSequenceId = () => {
        latestRequestId += 1;
        return latestRequestId;
      };

      const isLatestRequest = (requestId: number) =>
        requestId === latestRequestId;

      const loadFirst = loadNextQuestion({
        getNextQuestionFn,
        filters: { tagSlugs: [], difficulty: null, status: 'unanswered' },
        createIdempotencyKey: () => 'idem_1',
        nowMs: () => 1234,
        setLoadState,
        setSelectedChoiceId: vi.fn(),
        setSubmitResult: vi.fn(),
        setSubmitIdempotencyKey: vi.fn(),
        setQuestionLoadedAt: vi.fn(),
        setQuestion,
        createRequestSequenceId,
        isLatestRequest,
      });

      const loadSecond = loadNextQuestion({
        getNextQuestionFn,
        filters: { tagSlugs: [], difficulty: null, status: 'unanswered' },
        createIdempotencyKey: () => 'idem_2',
        nowMs: () => 5678,
        setLoadState,
        setSelectedChoiceId: vi.fn(),
        setSubmitResult: vi.fn(),
        setSubmitIdempotencyKey: vi.fn(),
        setQuestionLoadedAt: vi.fn(),
        setQuestion,
        createRequestSequenceId,
        isLatestRequest,
      });

      second.resolve(
        ok(
          createFixtureNextQuestion({
            questionId: fixtureQuestion2Id,
            slug: 'q-2',
          }),
        ),
      );
      await loadSecond;

      first.resolve(ok(createFixtureNextQuestion()));
      await loadFirst;

      expect(setQuestion).toHaveBeenCalledTimes(1);
      expect(setQuestion).toHaveBeenCalledWith(
        expect.objectContaining({ questionId: fixtureQuestion2Id }),
      );
      expect(setLoadState.mock.calls.at(-1)?.[0]).toEqual({ status: 'ready' });
    });

    it('loads next question and updates loadedAt when a question exists', async () => {
      const getNextQuestionFn = vi.fn(async () =>
        ok(createFixtureNextQuestion()),
      );
      const setLoadState = vi.fn();
      const setSelectedChoiceId = vi.fn();
      const setSubmitResult = vi.fn();
      const setSubmitIdempotencyKey = vi.fn();
      const setQuestionLoadedAt = vi.fn();
      const setQuestion = vi.fn();

      await loadNextQuestion({
        getNextQuestionFn,
        filters: {
          tagSlugs: ['opioids'],
          difficulty: 'easy',
          status: 'unanswered',
        },
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
        filters: {
          tagSlugs: ['opioids'],
          difficulties: ['easy'],
          statuses: ['unanswered'],
        },
      });
      expect(setLoadState).toHaveBeenCalledWith({ status: 'loading' });
      expect(setSelectedChoiceId).toHaveBeenCalledWith(null);
      expect(setSubmitResult).toHaveBeenCalledWith(null);
      expect(setSubmitIdempotencyKey).toHaveBeenCalledWith(null);
      expect(setQuestionLoadedAt).toHaveBeenCalledWith(null);

      expect(setQuestion).toHaveBeenCalledWith(
        expect.objectContaining({ questionId: fixtureQuestion1Id }),
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
        filters: { tagSlugs: [], difficulty: null, status: 'unanswered' },
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
        filters: { tagSlugs: [], difficulty: null, status: 'unanswered' },
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

    it('sets error state when controller throws', async () => {
      const setLoadState = vi.fn();
      const setQuestionLoadedAt = vi.fn();
      const setSubmitIdempotencyKey = vi.fn();
      const setQuestion = vi.fn();

      await loadNextQuestion({
        getNextQuestionFn: async () => {
          throw new Error('Network down');
        },
        filters: { tagSlugs: [], difficulty: null, status: 'unanswered' },
        createIdempotencyKey: () => 'idem_1',
        nowMs: () => 1234,
        setLoadState,
        setSelectedChoiceId: vi.fn(),
        setSubmitResult: vi.fn(),
        setSubmitIdempotencyKey,
        setQuestionLoadedAt,
        setQuestion,
      });

      expect(setQuestion).toHaveBeenCalledWith(null);
      expect(setQuestionLoadedAt).toHaveBeenLastCalledWith(null);
      expect(setSubmitIdempotencyKey).toHaveBeenLastCalledWith(null);
      expect(setLoadState).toHaveBeenCalledWith({
        status: 'error',
        message: 'Network down',
      });
    });

    it('returns no state updates when unmounted during loadNextQuestion', async () => {
      const deferred = createDeferred<ActionResult<NextQuestion | null>>();
      let mounted = true;

      const setLoadState = vi.fn();
      const setQuestionLoadedAt = vi.fn();
      const setSubmitIdempotencyKey = vi.fn();
      const setQuestion = vi.fn();

      const promise = loadNextQuestion({
        getNextQuestionFn: async () => deferred.promise,
        filters: { tagSlugs: [], difficulty: null, status: 'unanswered' },
        createIdempotencyKey: () => 'idem_1',
        nowMs: () => 1234,
        setLoadState,
        setSelectedChoiceId: vi.fn(),
        setSubmitResult: vi.fn(),
        setSubmitIdempotencyKey,
        setQuestionLoadedAt,
        setQuestion,
        isMounted: () => mounted,
      });

      mounted = false;
      deferred.resolve(ok(createFixtureNextQuestion()));
      await promise;

      expect(setQuestion).not.toHaveBeenCalled();
      expect(setQuestionLoadedAt).not.toHaveBeenCalledWith(1234);
      expect(setSubmitIdempotencyKey).not.toHaveBeenCalledWith('idem_1');
      expect(setLoadState).not.toHaveBeenCalledWith({ status: 'ready' });
    });
  });

  describe('createLoadNextQuestionAction', () => {
    it('runs load inside startTransition', () => {
      const startTransition = vi.fn((fn: () => void) => fn());
      const setLoadState = vi.fn();

      const action = createLoadNextQuestionAction({
        startTransition,
        getNextQuestionFn: async () => ok(createFixtureNextQuestion()),
        filters: { tagSlugs: [], difficulty: null, status: 'unanswered' },
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
});
