import { describe, expect, it, vi } from 'vitest';
import { err, ok } from '@/src/adapters/controllers/action-result';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import { setBookmarkForQuestion } from './bookmark-toggle';

const { fixtureQuestion1Id, fixtureChoice1Id } = vi.hoisted(() => ({
  fixtureQuestion1Id: crypto.randomUUID(),
  fixtureChoice1Id: crypto.randomUUID(),
}));

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

describe('bookmark-toggle', () => {
  describe('setBookmarkForQuestion', () => {
    it('rotates the idempotency key after a successful set-bookmark request', async () => {
      const setBookmarkStatus = vi.fn();
      const setBookmarkedQuestionIds = vi.fn();
      const onBookmarkToggled = vi.fn();
      const createIdempotencyKey = vi
        .fn<() => string>()
        .mockReturnValueOnce('idem_1')
        .mockReturnValueOnce('idem_2');
      const setBookmarkIdempotencyKey = vi.fn();

      await setBookmarkForQuestion({
        question: createFixtureNextQuestion({ questionId: fixtureQuestion1Id }),
        desiredBookmarked: true,
        createIdempotencyKey,
        setBookmarkIdempotencyKey,
        setBookmarkFn: vi.fn(async () => ok({ bookmarked: true })),
        setBookmarkStatus,
        setBookmarkedQuestionIds,
        onBookmarkToggled,
      });

      expect(createIdempotencyKey).toHaveBeenCalledTimes(2);
      expect(setBookmarkIdempotencyKey).toHaveBeenNthCalledWith(1, 'idem_1');
      expect(setBookmarkIdempotencyKey).toHaveBeenNthCalledWith(2, 'idem_2');
      expect(setBookmarkStatus).toHaveBeenNthCalledWith(1, 'loading');
      expect(setBookmarkStatus).toHaveBeenNthCalledWith(2, 'idle');
      expect(setBookmarkedQuestionIds).toHaveBeenCalledTimes(1);
      expect(onBookmarkToggled).toHaveBeenCalledWith(true);
    });

    it('persists a generated idempotency key before the request and does not rotate it after failure', async () => {
      const events: string[] = [];
      const createIdempotencyKey = vi
        .fn<() => string>()
        .mockReturnValueOnce('idem_1')
        .mockReturnValueOnce('idem_2');
      const setBookmarkIdempotencyKey = vi.fn((key: string) => {
        events.push(`persist:${key}`);
      });
      const setBookmarkFn = vi.fn(async (input: unknown) => {
        events.push(
          `request:${(input as { idempotencyKey?: string }).idempotencyKey ?? 'missing'}`,
        );
        return err('INTERNAL_ERROR', 'Boom');
      });

      await setBookmarkForQuestion({
        question: createFixtureNextQuestion(),
        desiredBookmarked: true,
        createIdempotencyKey,
        setBookmarkIdempotencyKey,
        setBookmarkFn,
        setBookmarkStatus: vi.fn(),
        setBookmarkedQuestionIds: vi.fn(),
      });

      expect(events).toEqual(['persist:idem_1', 'request:idem_1']);
      expect(setBookmarkIdempotencyKey).toHaveBeenCalledTimes(1);
      expect(createIdempotencyKey).toHaveBeenCalledTimes(1);
    });

    it('rotates the idempotency key after a determinate cached failure', async () => {
      const setBookmarkIdempotencyKey = vi.fn();

      await setBookmarkForQuestion({
        question: createFixtureNextQuestion(),
        desiredBookmarked: true,
        bookmarkIdempotencyKey: 'idem_1',
        createIdempotencyKey: () => 'idem_2',
        setBookmarkIdempotencyKey,
        setBookmarkFn: vi.fn(async () =>
          err('NOT_FOUND', 'Question not found'),
        ),
        setBookmarkStatus: vi.fn(),
        setBookmarkedQuestionIds: vi.fn(),
      });

      expect(setBookmarkIdempotencyKey).toHaveBeenCalledWith('idem_2');
    });

    it('preserves the idempotency key after a thrown transport failure', async () => {
      const setBookmarkIdempotencyKey = vi.fn();

      await setBookmarkForQuestion({
        question: createFixtureNextQuestion(),
        desiredBookmarked: true,
        bookmarkIdempotencyKey: 'idem_1',
        createIdempotencyKey: () => 'idem_2',
        setBookmarkIdempotencyKey,
        setBookmarkFn: vi.fn(async () => {
          throw new Error('Network down');
        }),
        setBookmarkStatus: vi.fn(),
        setBookmarkedQuestionIds: vi.fn(),
      });

      expect(setBookmarkIdempotencyKey).not.toHaveBeenCalled();
    });

    it('reports an error state when the set-bookmark request returns a non-ok result', async () => {
      const setBookmarkStatus = vi.fn();
      const setBookmarkedQuestionIds = vi.fn();
      const onBookmarkError = vi.fn();

      await setBookmarkForQuestion({
        question: createFixtureNextQuestion({ questionId: fixtureQuestion1Id }),
        desiredBookmarked: true,
        setBookmarkFn: vi.fn(async () =>
          err('INTERNAL_ERROR', 'Failed to set bookmark'),
        ),
        setBookmarkStatus,
        setBookmarkedQuestionIds,
        onBookmarkError,
      });

      expect(onBookmarkError).toHaveBeenCalledWith(
        'Failed to save bookmark. Please try again.',
      );
      expect(setBookmarkStatus).toHaveBeenNthCalledWith(1, 'loading');
      expect(setBookmarkStatus).toHaveBeenNthCalledWith(2, 'error');
      expect(setBookmarkedQuestionIds).not.toHaveBeenCalled();
    });

    it('returns early when no question is available', async () => {
      const createIdempotencyKey = vi.fn<() => string>();
      const setBookmarkIdempotencyKey = vi.fn();
      const setBookmarkFn = vi.fn();
      const setBookmarkStatus = vi.fn();
      const setBookmarkedQuestionIds = vi.fn();

      await setBookmarkForQuestion({
        question: null,
        desiredBookmarked: true,
        createIdempotencyKey,
        setBookmarkIdempotencyKey,
        setBookmarkFn,
        setBookmarkStatus,
        setBookmarkedQuestionIds,
      });

      expect(createIdempotencyKey).not.toHaveBeenCalled();
      expect(setBookmarkIdempotencyKey).not.toHaveBeenCalled();
      expect(setBookmarkFn).not.toHaveBeenCalled();
      expect(setBookmarkStatus).not.toHaveBeenCalled();
      expect(setBookmarkedQuestionIds).not.toHaveBeenCalled();
    });

    it('does not apply post-request state updates after unmount', async () => {
      const setBookmarkStatus = vi.fn();
      const setBookmarkedQuestionIds = vi.fn();
      const onBookmarkToggled = vi.fn();
      const createIdempotencyKey = vi
        .fn<() => string>()
        .mockReturnValueOnce('idem_1')
        .mockReturnValueOnce('idem_2');
      const setBookmarkIdempotencyKey = vi.fn();

      await setBookmarkForQuestion({
        question: createFixtureNextQuestion({ questionId: fixtureQuestion1Id }),
        desiredBookmarked: true,
        createIdempotencyKey,
        setBookmarkIdempotencyKey,
        setBookmarkFn: vi.fn(async () => ok({ bookmarked: true })),
        setBookmarkStatus,
        setBookmarkedQuestionIds,
        onBookmarkToggled,
        isMounted: () => false,
      });

      expect(setBookmarkStatus).toHaveBeenCalledTimes(1);
      expect(setBookmarkStatus).toHaveBeenCalledWith('loading');
      expect(setBookmarkedQuestionIds).not.toHaveBeenCalled();
      expect(onBookmarkToggled).not.toHaveBeenCalled();
      expect(setBookmarkIdempotencyKey).toHaveBeenCalledTimes(1);
      expect(setBookmarkIdempotencyKey).toHaveBeenCalledWith('idem_1');
      expect(createIdempotencyKey).toHaveBeenCalledTimes(1);
    });

    it('uses the mutation timeout tier for bookmark writes', async () => {
      vi.useFakeTimers();
      try {
        const setBookmarkStatus = vi.fn();
        const setBookmarkedQuestionIds = vi.fn();
        const onBookmarkError = vi.fn();

        const promise = setBookmarkForQuestion({
          question: createFixtureNextQuestion({
            questionId: fixtureQuestion1Id,
          }),
          desiredBookmarked: true,
          setBookmarkFn: async () => new Promise<never>(() => {}),
          setBookmarkStatus,
          setBookmarkedQuestionIds,
          onBookmarkError,
        });

        await vi.advanceTimersByTimeAsync(10_000);

        expect(onBookmarkError).not.toHaveBeenCalled();
        expect(setBookmarkStatus).toHaveBeenCalledTimes(1);
        expect(setBookmarkStatus).toHaveBeenCalledWith('loading');

        await vi.advanceTimersByTimeAsync(5_000);
        await promise;

        expect(onBookmarkError).toHaveBeenCalledWith(
          'Failed to save bookmark. Please try again.',
        );
        expect(setBookmarkStatus).toHaveBeenNthCalledWith(2, 'error');
        expect(setBookmarkedQuestionIds).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
