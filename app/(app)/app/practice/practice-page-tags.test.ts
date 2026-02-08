import { describe, expect, it, vi } from 'vitest';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { err, ok } from '@/src/adapters/controllers/action-result';
import { createTagsEffect } from './practice-page-tags';

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let capturedResolve: ((value: T | PromiseLike<T>) => void) | null = null;
  const promise = new Promise<T>((r) => {
    capturedResolve = r;
  });

  return {
    promise,
    resolve: (value) => {
      if (!capturedResolve) {
        throw new Error('Expected promise resolver to be captured');
      }
      capturedResolve(value);
    },
  };
}

describe('practice-page-tags', () => {
  describe('createTagsEffect', () => {
    it('loads tags and transitions to idle', async () => {
      const setTagLoadStatus = vi.fn();
      const setAvailableTags = vi.fn();
      const getTagsFn = vi.fn(
        async (): Promise<ActionResult<{ rows: Array<{ slug: string }> }>> =>
          ok({ rows: [{ slug: 'tag-1' }] }),
      );

      createTagsEffect({
        getTagsFn,
        setTagLoadStatus,
        setAvailableTags,
      });

      expect(setTagLoadStatus).toHaveBeenCalledWith('loading');

      await Promise.resolve();

      expect(getTagsFn).toHaveBeenCalledWith({});
      expect(setAvailableTags).toHaveBeenCalledWith([{ slug: 'tag-1' }]);
      expect(setTagLoadStatus).toHaveBeenLastCalledWith('idle');
    });

    it('sets error state when the request throws', async () => {
      const setTagLoadStatus = vi.fn();
      const setAvailableTags = vi.fn();
      const getTagsFn = vi.fn(async () => {
        throw new Error('boom');
      });

      createTagsEffect({
        getTagsFn,
        setTagLoadStatus,
        setAvailableTags,
      });

      await Promise.resolve();

      expect(setTagLoadStatus).toHaveBeenLastCalledWith('error');
      expect(setAvailableTags).not.toHaveBeenCalled();
    });

    it('sets error state when the request returns non-ok result', async () => {
      const setTagLoadStatus = vi.fn();
      const setAvailableTags = vi.fn();
      const getTagsFn = vi.fn(async () => err('INTERNAL_ERROR', 'Nope'));

      createTagsEffect({
        getTagsFn,
        setTagLoadStatus,
        setAvailableTags,
      });

      await Promise.resolve();

      expect(setTagLoadStatus).toHaveBeenLastCalledWith('error');
      expect(setAvailableTags).not.toHaveBeenCalled();
    });

    it('does not update state after cleanup', async () => {
      const setTagLoadStatus = vi.fn();
      const setAvailableTags = vi.fn();

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
      });

      cleanup();
      deferred.resolve(ok({ rows: [{ slug: 'tag-1' }] }));

      await Promise.resolve();

      expect(setAvailableTags).not.toHaveBeenCalled();
      expect(setTagLoadStatus).not.toHaveBeenLastCalledWith('idle');
    });
  });
});
