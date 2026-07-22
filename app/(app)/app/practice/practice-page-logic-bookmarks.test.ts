import { describe, expect, it, vi } from 'vitest';
import {
  createBookmarksEffect,
  setBookmarkForQuestion,
} from '@/app/(app)/app/practice/practice-page-logic';
import { bookmarkRequestFingerprint } from '@/app/(app)/app/shared/bookmark-toggle';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { err, ok } from '@/src/adapters/controllers/action-result';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
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

describe('practice-page-logic bookmarks', () => {
  describe('createBookmarksEffect', () => {
    it('loads bookmarks and updates state on success', async () => {
      const setBookmarkedQuestionIds = vi.fn();
      const setBookmarkStatus = vi.fn();

      const cleanup = createBookmarksEffect({
        bookmarkRetryCount: 0,
        getBookmarkQuestionIdsFn: async () =>
          ok({
            questionIds: [fixtureQuestion1Id, fixtureQuestion2Id],
          }),
        setBookmarkedQuestionIds,
        setBookmarkStatus,
        setBookmarkRetryCount: vi.fn(),
        logError: vi.fn(),
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(setBookmarkedQuestionIds).toHaveBeenCalledWith(
        new Set([fixtureQuestion1Id, fixtureQuestion2Id]),
      );
      expect(setBookmarkStatus).toHaveBeenNthCalledWith(1, 'loading');
      expect(setBookmarkStatus).toHaveBeenNthCalledWith(2, 'idle');

      cleanup();
    });

    it('retries when bookmarks load fails and retryCount < 2', async () => {
      vi.useFakeTimers();
      try {
        let retry = 0;
        const setBookmarkRetryCount = vi.fn(
          (next: number | ((prev: number) => number)) => {
            retry = typeof next === 'function' ? next(retry) : next;
          },
        );

        const setTimeoutFn = vi.fn((fn: () => void, ms: number) =>
          setTimeout(fn, ms),
        );
        const clearTimeoutFn = vi.fn((id: ReturnType<typeof setTimeout>) =>
          clearTimeout(id),
        );

        const cleanup = createBookmarksEffect({
          bookmarkRetryCount: 0,
          getBookmarkQuestionIdsFn: async () => err('INTERNAL_ERROR', 'Boom'),
          setBookmarkedQuestionIds: vi.fn(),
          setBookmarkStatus: vi.fn(),
          setBookmarkRetryCount,
          setTimeoutFn,
          clearTimeoutFn,
          logError: vi.fn(),
        });

        await vi.advanceTimersByTimeAsync(0);

        expect(setTimeoutFn).toHaveBeenCalledWith(expect.any(Function), 1000);

        await vi.advanceTimersByTimeAsync(1000);
        expect(retry).toBe(1);

        cleanup();
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not retry when retryCount >= 2', async () => {
      const setTimeoutFn = vi.fn((fn: () => void, ms: number) =>
        setTimeout(fn, ms),
      );

      const cleanup = createBookmarksEffect({
        bookmarkRetryCount: 2,
        getBookmarkQuestionIdsFn: async () => err('INTERNAL_ERROR', 'Boom'),
        setBookmarkedQuestionIds: vi.fn(),
        setBookmarkStatus: vi.fn(),
        setBookmarkRetryCount: vi.fn(),
        setTimeoutFn,
        clearTimeoutFn: vi.fn(),
        logError: vi.fn(),
      });

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(setTimeoutFn).not.toHaveBeenCalled();

      cleanup();
    });

    it('clears any scheduled timeout on cleanup', async () => {
      vi.useFakeTimers();
      try {
        const setTimeoutFn = vi.fn((fn: () => void, ms: number) =>
          setTimeout(fn, ms),
        );
        const clearTimeoutFn = vi.fn((id: ReturnType<typeof setTimeout>) =>
          clearTimeout(id),
        );

        const cleanup = createBookmarksEffect({
          bookmarkRetryCount: 0,
          getBookmarkQuestionIdsFn: async () => err('INTERNAL_ERROR', 'Boom'),
          setBookmarkedQuestionIds: vi.fn(),
          setBookmarkStatus: vi.fn(),
          setBookmarkRetryCount: vi.fn(),
          setTimeoutFn,
          clearTimeoutFn,
          logError: vi.fn(),
        });

        await vi.advanceTimersByTimeAsync(0);
        cleanup();

        expect(clearTimeoutFn).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('returns no state updates when cleaned up before resolve', async () => {
      const setBookmarkedQuestionIds = vi.fn();
      const setBookmarkStatus = vi.fn();

      let resolveBookmarks:
        | ((value: ActionResult<{ questionIds: string[] }>) => void)
        | undefined;
      const pending = new Promise<ActionResult<{ questionIds: string[] }>>(
        (res) => {
          resolveBookmarks = res;
        },
      );
      if (!resolveBookmarks) throw new Error('Expected resolve function');

      const getBookmarkQuestionIdsFn = vi.fn(async () => pending);

      const cleanup = createBookmarksEffect({
        bookmarkRetryCount: 0,
        getBookmarkQuestionIdsFn,
        setBookmarkedQuestionIds,
        setBookmarkStatus,
        setBookmarkRetryCount: vi.fn(),
        logError: vi.fn(),
      });

      cleanup();
      resolveBookmarks(
        ok({
          questionIds: [fixtureQuestion1Id],
        }),
      );

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(setBookmarkedQuestionIds).not.toHaveBeenCalled();
      expect(setBookmarkStatus).toHaveBeenCalledTimes(1);
      expect(setBookmarkStatus).toHaveBeenCalledWith('loading');
    });

    it('sets error state when getBookmarkQuestionIdsFn throws', async () => {
      vi.useFakeTimers();
      try {
        const setBookmarkStatus = vi.fn();
        const setTimeoutFn = vi.fn((fn: () => void, ms: number) =>
          setTimeout(fn, ms),
        );
        const logError = vi.fn();

        const cleanup = createBookmarksEffect({
          bookmarkRetryCount: 0,
          getBookmarkQuestionIdsFn: async () => {
            throw new Error('Boom');
          },
          setBookmarkedQuestionIds: vi.fn(),
          setBookmarkStatus,
          setBookmarkRetryCount: vi.fn(),
          setTimeoutFn,
          clearTimeoutFn: vi.fn(),
          logError,
        });

        await vi.advanceTimersByTimeAsync(0);

        expect(logError).toHaveBeenCalledWith(
          'Failed to load bookmarks',
          expect.any(Error),
        );
        expect(setBookmarkStatus).toHaveBeenCalledWith('error');
        expect(setTimeoutFn).toHaveBeenCalledWith(expect.any(Function), 1000);

        cleanup();
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not log expected business bookmark-load failures', async () => {
      vi.useFakeTimers();
      try {
        const setBookmarkStatus = vi.fn();
        const logError = vi.fn();

        createBookmarksEffect({
          bookmarkRetryCount: 0,
          getBookmarkQuestionIdsFn: async () =>
            err('UNAUTHENTICATED', 'Authentication required'),
          setBookmarkedQuestionIds: vi.fn(),
          setBookmarkStatus,
          setBookmarkRetryCount: vi.fn(),
          setTimeoutFn: vi.fn((fn: () => void, ms: number) =>
            setTimeout(fn, ms),
          ),
          clearTimeoutFn: vi.fn(),
          logError,
        });

        await vi.advanceTimersByTimeAsync(0);

        expect(setBookmarkStatus).toHaveBeenLastCalledWith('error');
        expect(logError).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('setBookmarkForQuestion', () => {
    it('sets bookmark, forwards desired state and idempotency key, and retires the key on success', async () => {
      let ids = new Set<string>(['other']);
      const setBookmarkedQuestionIds = vi.fn(
        (next: Set<string> | ((prev: Set<string>) => Set<string>)) => {
          ids = typeof next === 'function' ? next(ids) : next;
        },
      );
      const onBookmarkToggled = vi.fn();
      const setBookmarkRequestToken = vi.fn();
      const setBookmarkFn = vi.fn(async () => ok({ bookmarked: true }));

      await setBookmarkForQuestion({
        question: createFixtureNextQuestion(),
        desiredBookmarked: true,
        bookmarkRequestToken: {
          key: 'idem_1',
          fingerprint: bookmarkRequestFingerprint({
            questionId: fixtureQuestion1Id,
            desiredBookmarked: true,
          }),
        },
        createIdempotencyKey: () => 'idem_2',
        setBookmarkRequestToken,
        setBookmarkFn,
        setBookmarkStatus: vi.fn(),
        setBookmarkedQuestionIds,
        onBookmarkToggled,
      });

      expect(setBookmarkFn).toHaveBeenCalledWith({
        questionId: fixtureQuestion1Id,
        bookmarked: true,
        idempotencyKey: 'idem_1',
      });
      expect(ids.has(fixtureQuestion1Id)).toBe(true);
      expect(onBookmarkToggled).toHaveBeenCalledWith(true);
      expect(setBookmarkRequestToken).toHaveBeenCalledWith(null);
    });

    it('sets error state when bookmark write fails', async () => {
      const setBookmarkStatus = vi.fn();
      const onBookmarkToggled = vi.fn();

      await setBookmarkForQuestion({
        question: createFixtureNextQuestion(),
        desiredBookmarked: true,
        setBookmarkFn: async () => err('INTERNAL_ERROR', 'Boom'),
        setBookmarkStatus,
        setBookmarkedQuestionIds: vi.fn(),
        onBookmarkToggled,
      });

      expect(setBookmarkStatus).toHaveBeenCalledWith('error');
      expect(onBookmarkToggled).not.toHaveBeenCalled();
    });

    it('removes the question id when bookmark is removed', async () => {
      let ids = new Set<string>([fixtureQuestion1Id, 'other']);

      const setBookmarkedQuestionIds = vi.fn(
        (next: Set<string> | ((prev: Set<string>) => Set<string>)) => {
          ids = typeof next === 'function' ? next(ids) : next;
        },
      );

      const setBookmarkStatus = vi.fn();
      const onBookmarkToggled = vi.fn();

      await setBookmarkForQuestion({
        question: createFixtureNextQuestion(),
        desiredBookmarked: false,
        setBookmarkFn: async () => ok({ bookmarked: false }),
        setBookmarkStatus,
        setBookmarkedQuestionIds,
        onBookmarkToggled,
      });

      expect(ids.has(fixtureQuestion1Id)).toBe(false);
      expect(onBookmarkToggled).toHaveBeenCalledWith(false);
      expect(setBookmarkStatus).toHaveBeenLastCalledWith('idle');
    });

    it('sets error state when bookmark write throws', async () => {
      const setBookmarkStatus = vi.fn();
      const onBookmarkToggled = vi.fn();
      const onBookmarkError = vi.fn();

      await setBookmarkForQuestion({
        question: createFixtureNextQuestion(),
        desiredBookmarked: true,
        setBookmarkFn: async () => {
          throw new Error('Boom');
        },
        setBookmarkStatus,
        setBookmarkedQuestionIds: vi.fn(),
        onBookmarkToggled,
        onBookmarkError,
      });

      expect(setBookmarkStatus).toHaveBeenLastCalledWith('error');
      expect(onBookmarkToggled).not.toHaveBeenCalled();
      expect(onBookmarkError).toHaveBeenCalledTimes(1);
      expect(onBookmarkError).toHaveBeenCalledWith(
        'Failed to save bookmark. Please try again.',
      );
    });

    it('logs thrown set-bookmark errors while preserving generic error UI state', async () => {
      const error = new Error('Boom');
      const logError = vi.fn();
      const setBookmarkStatus = vi.fn();
      const onBookmarkError = vi.fn();

      await setBookmarkForQuestion({
        question: createFixtureNextQuestion(),
        desiredBookmarked: true,
        setBookmarkFn: async () => {
          throw error;
        },
        setBookmarkStatus,
        setBookmarkedQuestionIds: vi.fn(),
        onBookmarkError,
        logError,
      });

      expect(logError).toHaveBeenCalledWith('Failed to set bookmark', error);
      expect(setBookmarkStatus).toHaveBeenLastCalledWith('error');
      expect(onBookmarkError).toHaveBeenCalledWith(
        'Failed to save bookmark. Please try again.',
      );
    });

    it('preserves generic bookmark error UI when logError throws for thrown errors', async () => {
      const error = new Error('Boom');
      const logError = vi.fn(() => {
        throw new Error('logger failed');
      });
      const setBookmarkStatus = vi.fn();
      const onBookmarkError = vi.fn();

      await expect(
        setBookmarkForQuestion({
          question: createFixtureNextQuestion(),
          desiredBookmarked: true,
          setBookmarkFn: async () => {
            throw error;
          },
          setBookmarkStatus,
          setBookmarkedQuestionIds: vi.fn(),
          onBookmarkError,
          logError,
        }),
      ).resolves.toBeUndefined();

      expect(logError).toHaveBeenCalledWith('Failed to set bookmark', error);
      expect(setBookmarkStatus).toHaveBeenLastCalledWith('error');
      expect(onBookmarkError).toHaveBeenCalledWith(
        'Failed to save bookmark. Please try again.',
      );
    });

    it('invokes error callback when set-bookmark controller returns an error result', async () => {
      const setBookmarkStatus = vi.fn();
      const onBookmarkError = vi.fn();

      await setBookmarkForQuestion({
        question: createFixtureNextQuestion(),
        desiredBookmarked: true,
        setBookmarkFn: async () => err('INTERNAL_ERROR', 'Boom'),
        setBookmarkStatus,
        setBookmarkedQuestionIds: vi.fn(),
        onBookmarkError,
      });

      expect(setBookmarkStatus).toHaveBeenLastCalledWith('error');
      expect(onBookmarkError).toHaveBeenCalledTimes(1);
      expect(onBookmarkError).toHaveBeenCalledWith(
        'Failed to save bookmark. Please try again.',
      );
    });

    it('logs structured set-bookmark failures while preserving generic error UI state', async () => {
      const structuredError = {
        code: 'INTERNAL_ERROR',
        message: 'Boom',
      } as const;
      const logError = vi.fn();
      const setBookmarkStatus = vi.fn();
      const onBookmarkError = vi.fn();

      await setBookmarkForQuestion({
        question: createFixtureNextQuestion(),
        desiredBookmarked: true,
        setBookmarkFn: async () => ({
          ok: false,
          error: structuredError,
        }),
        setBookmarkStatus,
        setBookmarkedQuestionIds: vi.fn(),
        onBookmarkError,
        logError,
      });

      expect(logError).toHaveBeenCalledWith(
        'Failed to set bookmark',
        structuredError,
      );
      expect(setBookmarkStatus).toHaveBeenLastCalledWith('error');
      expect(onBookmarkError).toHaveBeenCalledWith(
        'Failed to save bookmark. Please try again.',
      );
    });

    it('does not log expected business set-bookmark failures while preserving generic error UI state', async () => {
      const structuredError = {
        code: 'UNAUTHENTICATED',
        message: 'Authentication required',
      } as const;
      const logError = vi.fn();
      const setBookmarkStatus = vi.fn();
      const onBookmarkError = vi.fn();

      await setBookmarkForQuestion({
        question: createFixtureNextQuestion(),
        desiredBookmarked: true,
        setBookmarkFn: async () => ({
          ok: false,
          error: structuredError,
        }),
        setBookmarkStatus,
        setBookmarkedQuestionIds: vi.fn(),
        onBookmarkError,
        logError,
      });

      expect(logError).not.toHaveBeenCalled();
      expect(setBookmarkStatus).toHaveBeenLastCalledWith('error');
      expect(onBookmarkError).toHaveBeenCalledWith(
        'Failed to save bookmark. Please try again.',
      );
    });

    it('preserves generic bookmark error UI when logError throws for structured failures', async () => {
      const structuredError = {
        code: 'INTERNAL_ERROR',
        message: 'Boom',
      } as const;
      const logError = vi.fn(() => {
        throw new Error('logger failed');
      });
      const setBookmarkStatus = vi.fn();
      const onBookmarkError = vi.fn();

      await expect(
        setBookmarkForQuestion({
          question: createFixtureNextQuestion(),
          desiredBookmarked: true,
          setBookmarkFn: async () => ({
            ok: false,
            error: structuredError,
          }),
          setBookmarkStatus,
          setBookmarkedQuestionIds: vi.fn(),
          onBookmarkError,
          logError,
        }),
      ).resolves.toBeUndefined();

      expect(logError).toHaveBeenCalledWith(
        'Failed to set bookmark',
        structuredError,
      );
      expect(setBookmarkStatus).toHaveBeenLastCalledWith('error');
      expect(onBookmarkError).toHaveBeenCalledWith(
        'Failed to save bookmark. Please try again.',
      );
    });

    it('returns no state updates when unmounted during setBookmarkForQuestion', async () => {
      const deferred = createDeferred<ActionResult<{ bookmarked: boolean }>>();
      let mounted = true;

      const setBookmarkStatus = vi.fn();
      const setBookmarkedQuestionIds = vi.fn();
      const onBookmarkToggled = vi.fn();

      const promise = setBookmarkForQuestion({
        question: createFixtureNextQuestion(),
        desiredBookmarked: true,
        setBookmarkFn: async () => deferred.promise,
        setBookmarkStatus,
        setBookmarkedQuestionIds,
        onBookmarkToggled,
        isMounted: () => mounted,
      });

      mounted = false;
      deferred.resolve(ok({ bookmarked: true }));
      await promise;

      expect(setBookmarkedQuestionIds).not.toHaveBeenCalled();
      expect(onBookmarkToggled).not.toHaveBeenCalled();
      expect(setBookmarkStatus).not.toHaveBeenCalledWith('idle');
    });

    it('logs thrown set-bookmark errors after unmount without applying error UI state', async () => {
      const deferred = createDeferred<ActionResult<{ bookmarked: boolean }>>();
      const error = new Error('Boom');
      let mounted = true;

      const logError = vi.fn();
      const setBookmarkStatus = vi.fn();
      const onBookmarkError = vi.fn();

      const promise = setBookmarkForQuestion({
        question: createFixtureNextQuestion(),
        desiredBookmarked: true,
        setBookmarkFn: async () => deferred.promise,
        setBookmarkStatus,
        setBookmarkedQuestionIds: vi.fn(),
        onBookmarkError,
        logError,
        isMounted: () => mounted,
      });

      mounted = false;
      deferred.reject(error);
      await promise;

      expect(logError).toHaveBeenCalledWith('Failed to set bookmark', error);
      expect(onBookmarkError).not.toHaveBeenCalled();
      expect(setBookmarkStatus).not.toHaveBeenCalledWith('error');
    });

    it('logs structured set-bookmark failures after unmount without applying error UI state', async () => {
      const deferred = createDeferred<ActionResult<{ bookmarked: boolean }>>();
      const structuredError = {
        code: 'INTERNAL_ERROR',
        message: 'Boom',
      } as const;
      let mounted = true;

      const logError = vi.fn();
      const setBookmarkStatus = vi.fn();
      const onBookmarkError = vi.fn();

      const promise = setBookmarkForQuestion({
        question: createFixtureNextQuestion(),
        desiredBookmarked: true,
        setBookmarkFn: async () => deferred.promise,
        setBookmarkStatus,
        setBookmarkedQuestionIds: vi.fn(),
        onBookmarkError,
        logError,
        isMounted: () => mounted,
      });

      mounted = false;
      deferred.resolve({
        ok: false,
        error: structuredError,
      });
      await promise;

      expect(logError).toHaveBeenCalledWith(
        'Failed to set bookmark',
        structuredError,
      );
      expect(onBookmarkError).not.toHaveBeenCalled();
      expect(setBookmarkStatus).not.toHaveBeenCalledWith('error');
    });
  });
});
