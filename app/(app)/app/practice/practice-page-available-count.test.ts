import { describe, expect, it, vi } from 'vitest';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { err, ok } from '@/src/adapters/controllers/action-result';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { createAvailableQuestionsCountEffect } from './practice-page-available-count';

describe('practice-page-available-count', () => {
  describe('createAvailableQuestionsCountEffect', () => {
    it('loads the available count and transitions to idle', async () => {
      const setAvailableCountStatus = vi.fn();
      const setAvailableCount = vi.fn();
      const logError = vi.fn();
      const countAvailableQuestionsFn = vi.fn(
        async (): Promise<ActionResult<{ count: number }>> => ok({ count: 42 }),
      );

      createAvailableQuestionsCountEffect({
        countAvailableQuestionsFn,
        debounceMs: 0,
        filters: { tagSlugs: [], difficulties: [], statuses: ['unanswered'] },
        setAvailableCountStatus,
        setAvailableCount,
        logError,
      });

      expect(setAvailableCountStatus).toHaveBeenCalledWith('loading');

      await Promise.resolve();

      expect(countAvailableQuestionsFn).toHaveBeenCalledWith({
        tagSlugs: [],
        difficulties: [],
        statuses: ['unanswered'],
      });
      expect(setAvailableCount).toHaveBeenCalledWith(42);
      expect(setAvailableCountStatus).toHaveBeenLastCalledWith('idle');
      expect(logError).not.toHaveBeenCalled();
    });

    it('sets error state when the request throws', async () => {
      const setAvailableCountStatus = vi.fn();
      const setAvailableCount = vi.fn();
      const logError = vi.fn();
      const countAvailableQuestionsFn = vi.fn(async () => {
        throw new Error('boom');
      });

      createAvailableQuestionsCountEffect({
        countAvailableQuestionsFn,
        debounceMs: 0,
        filters: { tagSlugs: [], difficulties: [], statuses: ['unanswered'] },
        setAvailableCountStatus,
        setAvailableCount,
        logError,
      });

      await Promise.resolve();

      expect(setAvailableCountStatus).toHaveBeenLastCalledWith('error');
      expect(setAvailableCount).not.toHaveBeenCalled();
      expect(logError).toHaveBeenCalledTimes(1);
      expect(logError).toHaveBeenCalledWith(
        'Failed to count available questions',
        expect.any(Error),
      );
    });

    it('sets error state when the request returns non-ok result', async () => {
      const setAvailableCountStatus = vi.fn();
      const setAvailableCount = vi.fn();
      const logError = vi.fn();
      const countAvailableQuestionsFn = vi.fn(async () =>
        err('INTERNAL_ERROR', 'Nope'),
      );

      createAvailableQuestionsCountEffect({
        countAvailableQuestionsFn,
        debounceMs: 0,
        filters: { tagSlugs: [], difficulties: [], statuses: ['unanswered'] },
        setAvailableCountStatus,
        setAvailableCount,
        logError,
      });

      await Promise.resolve();

      expect(setAvailableCountStatus).toHaveBeenLastCalledWith('error');
      expect(setAvailableCount).not.toHaveBeenCalled();
      expect(logError).toHaveBeenCalledTimes(1);
      expect(logError).toHaveBeenCalledWith(
        'Failed to count available questions',
        {
          code: 'INTERNAL_ERROR',
          message: 'Nope',
        },
      );
    });

    it('does not update state after cleanup', async () => {
      const setAvailableCountStatus = vi.fn();
      const setAvailableCount = vi.fn();
      const logError = vi.fn();

      const deferred = createDeferred<ActionResult<{ count: number }>>();
      const countAvailableQuestionsFn = vi.fn(async () => deferred.promise);

      const cleanup = createAvailableQuestionsCountEffect({
        countAvailableQuestionsFn,
        debounceMs: 0,
        filters: { tagSlugs: [], difficulties: [], statuses: ['unanswered'] },
        setAvailableCountStatus,
        setAvailableCount,
        logError,
      });

      cleanup();
      deferred.resolve(ok({ count: 42 }));

      await Promise.resolve();

      expect(setAvailableCount).not.toHaveBeenCalled();
      expect(setAvailableCountStatus).toHaveBeenCalledTimes(1);
      expect(setAvailableCountStatus).toHaveBeenCalledWith('loading');
      expect(logError).not.toHaveBeenCalled();
    });

    it('debounces the request and cancels before the debounce elapses', async () => {
      vi.useFakeTimers();
      try {
        const setAvailableCountStatus = vi.fn();
        const setAvailableCount = vi.fn();
        const logError = vi.fn();
        const countAvailableQuestionsFn = vi.fn(
          async (): Promise<ActionResult<{ count: number }>> =>
            ok({ count: 42 }),
        );

        const cleanup = createAvailableQuestionsCountEffect({
          countAvailableQuestionsFn,
          debounceMs: 200,
          filters: { tagSlugs: [], difficulties: [], statuses: ['unanswered'] },
          setAvailableCountStatus,
          setAvailableCount,
          logError,
        });

        cleanup();

        await vi.advanceTimersByTimeAsync(200);
        await Promise.resolve();

        expect(countAvailableQuestionsFn).not.toHaveBeenCalled();
        expect(setAvailableCountStatus).toHaveBeenCalledTimes(1);
        expect(setAvailableCountStatus).toHaveBeenCalledWith('loading');
        expect(setAvailableCount).not.toHaveBeenCalled();
        expect(logError).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
