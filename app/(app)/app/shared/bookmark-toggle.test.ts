import { describe, expect, it, vi } from 'vitest';
import { err, ok } from '@/src/adapters/controllers/action-result';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import { toggleBookmarkForQuestion } from './bookmark-toggle';

describe('bookmark-toggle', () => {
  describe('toggleBookmarkForQuestion', () => {
    it('rotates the idempotency key after a successful toggle', async () => {
      const setBookmarkStatus = vi.fn();
      const setBookmarkedQuestionIds = vi.fn();
      const onBookmarkToggled = vi.fn();
      const createIdempotencyKey = vi
        .fn<() => string>()
        .mockReturnValueOnce('idem_1')
        .mockReturnValueOnce('idem_2');
      const setBookmarkIdempotencyKey = vi.fn();

      await toggleBookmarkForQuestion({
        question: createNextQuestion({ questionId: 'question-1' }),
        createIdempotencyKey,
        setBookmarkIdempotencyKey,
        toggleBookmarkFn: vi.fn(async () => ok({ bookmarked: true })),
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
      const toggleBookmarkFn = vi.fn(async (input: unknown) => {
        events.push(
          `request:${(input as { idempotencyKey?: string }).idempotencyKey ?? 'missing'}`,
        );
        return err('INTERNAL_ERROR', 'Boom');
      });

      await toggleBookmarkForQuestion({
        question: createNextQuestion(),
        createIdempotencyKey,
        setBookmarkIdempotencyKey,
        toggleBookmarkFn,
        setBookmarkStatus: vi.fn(),
        setBookmarkedQuestionIds: vi.fn(),
      });

      expect(events).toEqual(['persist:idem_1', 'request:idem_1']);
      expect(setBookmarkIdempotencyKey).toHaveBeenCalledTimes(1);
      expect(createIdempotencyKey).toHaveBeenCalledTimes(1);
    });

    it('reports an error state when the toggle request returns a non-ok result', async () => {
      const setBookmarkStatus = vi.fn();
      const setBookmarkedQuestionIds = vi.fn();
      const onBookmarkError = vi.fn();

      await toggleBookmarkForQuestion({
        question: createNextQuestion({ questionId: 'question-1' }),
        toggleBookmarkFn: vi.fn(async () =>
          err('INTERNAL_ERROR', 'Failed to toggle bookmark'),
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
      const toggleBookmarkFn = vi.fn();
      const setBookmarkStatus = vi.fn();
      const setBookmarkedQuestionIds = vi.fn();

      await toggleBookmarkForQuestion({
        question: null,
        createIdempotencyKey,
        setBookmarkIdempotencyKey,
        toggleBookmarkFn,
        setBookmarkStatus,
        setBookmarkedQuestionIds,
      });

      expect(createIdempotencyKey).not.toHaveBeenCalled();
      expect(setBookmarkIdempotencyKey).not.toHaveBeenCalled();
      expect(toggleBookmarkFn).not.toHaveBeenCalled();
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

      await toggleBookmarkForQuestion({
        question: createNextQuestion({ questionId: 'question-1' }),
        createIdempotencyKey,
        setBookmarkIdempotencyKey,
        toggleBookmarkFn: vi.fn(async () => ok({ bookmarked: true })),
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

    it('uses the mutation timeout tier for bookmark toggles', async () => {
      vi.useFakeTimers();
      try {
        const setBookmarkStatus = vi.fn();
        const setBookmarkedQuestionIds = vi.fn();
        const onBookmarkError = vi.fn();

        const promise = toggleBookmarkForQuestion({
          question: createNextQuestion({ questionId: 'question-1' }),
          toggleBookmarkFn: async () => new Promise<never>(() => {}),
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
