import { describe, expect, it, vi } from 'vitest';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { err, ok } from '@/src/adapters/controllers/action-result';
import {
  abandonIncompleteSession,
  createIncompleteSessionEffect,
} from './practice-page-incomplete-session';

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

describe('practice-page-incomplete-session', () => {
  describe('createIncompleteSessionEffect', () => {
    it('loads the incomplete session and transitions to idle', async () => {
      const setStatus = vi.fn();
      const setError = vi.fn();
      const setSession = vi.fn();
      const getIncompletePracticeSessionFn = vi.fn(
        async (): Promise<ActionResult<{ sessionId: string } | null>> =>
          ok({ sessionId: 'session-1' }),
      );

      createIncompleteSessionEffect({
        getIncompletePracticeSessionFn,
        setIncompleteSessionStatus: setStatus,
        setIncompleteSessionError: setError,
        setIncompleteSession: setSession,
      });

      expect(setStatus).toHaveBeenCalledWith('loading');
      expect(setError).toHaveBeenCalledWith(null);

      await Promise.resolve();

      expect(getIncompletePracticeSessionFn).toHaveBeenCalledWith({});
      expect(setSession).toHaveBeenCalledWith({ sessionId: 'session-1' });
      expect(setStatus).toHaveBeenLastCalledWith('idle');
    });

    it('sets error state when the request throws', async () => {
      const setStatus = vi.fn();
      const setError = vi.fn();
      const setSession = vi.fn();
      const getIncompletePracticeSessionFn = vi.fn(async () => {
        throw new Error('boom');
      });

      createIncompleteSessionEffect({
        getIncompletePracticeSessionFn,
        setIncompleteSessionStatus: setStatus,
        setIncompleteSessionError: setError,
        setIncompleteSession: setSession,
      });

      await Promise.resolve();

      expect(setStatus).toHaveBeenLastCalledWith('error');
      expect(setError).toHaveBeenLastCalledWith('boom');
      expect(setSession).not.toHaveBeenCalled();
    });

    it('sets error state when the request returns a non-ok result', async () => {
      const setStatus = vi.fn();
      const setError = vi.fn();
      const setSession = vi.fn();
      const getIncompletePracticeSessionFn = vi.fn(async () =>
        err('INTERNAL_ERROR', 'Nope'),
      );

      createIncompleteSessionEffect({
        getIncompletePracticeSessionFn,
        setIncompleteSessionStatus: setStatus,
        setIncompleteSessionError: setError,
        setIncompleteSession: setSession,
      });

      await Promise.resolve();

      expect(setStatus).toHaveBeenLastCalledWith('error');
      expect(setError).toHaveBeenLastCalledWith('Nope');
      expect(setSession).not.toHaveBeenCalled();
    });

    it('does not update state after cleanup', async () => {
      const setStatus = vi.fn();
      const setError = vi.fn();
      const setSession = vi.fn();

      const deferred =
        createDeferred<ActionResult<{ sessionId: string } | null>>();
      const getIncompletePracticeSessionFn = vi.fn(
        async (): Promise<ActionResult<{ sessionId: string } | null>> =>
          deferred.promise,
      );

      const cleanup = createIncompleteSessionEffect({
        getIncompletePracticeSessionFn,
        setIncompleteSessionStatus: setStatus,
        setIncompleteSessionError: setError,
        setIncompleteSession: setSession,
      });

      cleanup();
      deferred.resolve(ok({ sessionId: 'session-1' }));

      await Promise.resolve();

      expect(setSession).not.toHaveBeenCalled();
      expect(setStatus).not.toHaveBeenLastCalledWith('idle');
    });
  });

  describe('abandonIncompleteSession', () => {
    it('ends the session and clears local state on success', async () => {
      const setStatus = vi.fn();
      const setError = vi.fn();
      const setSession = vi.fn();
      const endPracticeSessionFn = vi.fn(async () => ok({}));

      await abandonIncompleteSession({
        sessionId: 'session-1',
        endPracticeSessionFn,
        setIncompleteSessionStatus: setStatus,
        setIncompleteSessionError: setError,
        setIncompleteSession: setSession,
        isMounted: () => true,
      });

      expect(endPracticeSessionFn).toHaveBeenCalledWith({
        sessionId: 'session-1',
        idempotencyKey: 'session-1',
      });
      expect(setSession).toHaveBeenCalledWith(null);
      expect(setStatus).toHaveBeenLastCalledWith('idle');
    });

    it('sets error state when the request throws and is still mounted', async () => {
      const setStatus = vi.fn();
      const setError = vi.fn();
      const setSession = vi.fn();
      const endPracticeSessionFn = vi.fn(async () => {
        throw new Error('boom');
      });

      await abandonIncompleteSession({
        sessionId: 'session-1',
        endPracticeSessionFn,
        setIncompleteSessionStatus: setStatus,
        setIncompleteSessionError: setError,
        setIncompleteSession: setSession,
        isMounted: () => true,
      });

      expect(setStatus).toHaveBeenLastCalledWith('error');
      expect(setError).toHaveBeenLastCalledWith('boom');
      expect(setSession).not.toHaveBeenCalled();
    });

    it('does not set error state when unmounted after a thrown request', async () => {
      const setStatus = vi.fn();
      const setError = vi.fn();
      const setSession = vi.fn();
      const endPracticeSessionFn = vi.fn(async () => {
        throw new Error('boom');
      });

      await abandonIncompleteSession({
        sessionId: 'session-1',
        endPracticeSessionFn,
        setIncompleteSessionStatus: setStatus,
        setIncompleteSessionError: setError,
        setIncompleteSession: setSession,
        isMounted: () => false,
      });

      expect(setStatus).not.toHaveBeenLastCalledWith('error');
      expect(setError).not.toHaveBeenLastCalledWith('boom');
      expect(setSession).not.toHaveBeenCalled();
    });

    it('sets error state when the request returns a non-ok result', async () => {
      const setStatus = vi.fn();
      const setError = vi.fn();
      const setSession = vi.fn();
      const endPracticeSessionFn = vi.fn(async () =>
        err('INTERNAL_ERROR', 'Nope'),
      );

      await abandonIncompleteSession({
        sessionId: 'session-1',
        endPracticeSessionFn,
        setIncompleteSessionStatus: setStatus,
        setIncompleteSessionError: setError,
        setIncompleteSession: setSession,
        isMounted: () => true,
      });

      expect(setStatus).toHaveBeenLastCalledWith('error');
      expect(setError).toHaveBeenLastCalledWith('Nope');
      expect(setSession).not.toHaveBeenCalled();
    });
  });
});
