import { describe, expect, it, vi } from 'vitest';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { err, ok } from '@/src/adapters/controllers/action-result';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { createTagsEffect } from './practice-page-tags';

describe('practice-page-tags', () => {
  describe('createTagsEffect', () => {
    it('loads tags and transitions to idle', async () => {
      const setTagLoadStatus = vi.fn();
      const setAvailableTags = vi.fn();
      const logError = vi.fn();
      const getTagsFn = vi.fn(
        async (): Promise<ActionResult<{ rows: Array<{ slug: string }> }>> =>
          ok({ rows: [{ slug: 'tag-1' }] }),
      );

      createTagsEffect({
        getTagsFn,
        setTagLoadStatus,
        setAvailableTags,
        logError,
      });

      expect(setTagLoadStatus).toHaveBeenCalledWith('loading');

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(getTagsFn).toHaveBeenCalledWith({});
      expect(setAvailableTags).toHaveBeenCalledWith([{ slug: 'tag-1' }]);
      expect(setTagLoadStatus).toHaveBeenLastCalledWith('idle');
      expect(logError).not.toHaveBeenCalled();
    });

    it('sets error state when the request throws', async () => {
      const setTagLoadStatus = vi.fn();
      const setAvailableTags = vi.fn();
      const logError = vi.fn();
      const getTagsFn = vi.fn(async () => {
        throw new Error('boom');
      });

      createTagsEffect({
        getTagsFn,
        setTagLoadStatus,
        setAvailableTags,
        logError,
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(setTagLoadStatus).toHaveBeenLastCalledWith('error');
      expect(setAvailableTags).not.toHaveBeenCalled();
      expect(logError).toHaveBeenCalledTimes(1);
      expect(logError).toHaveBeenCalledWith(
        'Failed to load tags',
        expect.any(Error),
      );
    });

    it('sets error state when the request returns non-ok result', async () => {
      const setTagLoadStatus = vi.fn();
      const setAvailableTags = vi.fn();
      const logError = vi.fn();
      const getTagsFn = vi.fn(async () => err('INTERNAL_ERROR', 'Nope'));

      createTagsEffect({
        getTagsFn,
        setTagLoadStatus,
        setAvailableTags,
        logError,
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(setTagLoadStatus).toHaveBeenLastCalledWith('error');
      expect(setAvailableTags).not.toHaveBeenCalled();
      expect(logError).toHaveBeenCalledTimes(1);
      expect(logError).toHaveBeenCalledWith('Failed to load tags', {
        code: 'INTERNAL_ERROR',
        message: 'Nope',
      });
    });

    it('does not update state after cleanup', async () => {
      const setTagLoadStatus = vi.fn();
      const setAvailableTags = vi.fn();
      const logError = vi.fn();

      const deferred =
        createDeferred<ActionResult<{ rows: Array<{ slug: string }> }>>();
      const getTagsFn = vi.fn(
        async (): Promise<ActionResult<{ rows: Array<{ slug: string }> }>> =>
          deferred.promise,
      );

      const cleanup = createTagsEffect({
        getTagsFn,
        setTagLoadStatus,
        setAvailableTags,
        logError,
      });

      cleanup();
      deferred.resolve(ok({ rows: [{ slug: 'tag-1' }] }));

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(setAvailableTags).not.toHaveBeenCalled();
      expect(setTagLoadStatus).toHaveBeenCalledTimes(1);
      expect(setTagLoadStatus).toHaveBeenCalledWith('loading');
      expect(logError).not.toHaveBeenCalled();
    });
  });
});
