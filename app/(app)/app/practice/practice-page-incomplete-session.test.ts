import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { err, ok } from '@/src/adapters/controllers/action-result';
import { createDeferred } from '@/tests/test-helpers/create-deferred';

const { reportClientErrorMock } = vi.hoisted(() => ({
  reportClientErrorMock: vi.fn(),
}));

vi.mock('@/lib/report-client-error', () => ({
  reportClientError: reportClientErrorMock,
}));

import {
  abandonIncompleteSession,
  createIncompleteSessionEffect,
} from './practice-page-incomplete-session';

describe('practice-page-incomplete-session', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    reportClientErrorMock.mockReset();
  });

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

      await new Promise((r) => setTimeout(r, 0));

      expect(getIncompletePracticeSessionFn).toHaveBeenCalledWith({});
      expect(setSession).toHaveBeenCalledWith({ sessionId: 'session-1' });
      expect(setStatus).toHaveBeenLastCalledWith('idle');
    });

    it('sets error state when the request throws', async () => {
      const setStatus = vi.fn();
      const setError = vi.fn();
      const setSession = vi.fn();
      const error = new Error('boom');
      const getIncompletePracticeSessionFn = vi.fn(async () => {
        throw error;
      });

      createIncompleteSessionEffect({
        getIncompletePracticeSessionFn,
        setIncompleteSessionStatus: setStatus,
        setIncompleteSessionError: setError,
        setIncompleteSession: setSession,
      });

      await new Promise((r) => setTimeout(r, 0));

      expect(setStatus).toHaveBeenLastCalledWith('error');
      expect(setError).toHaveBeenLastCalledWith('boom');
      expect(setSession).not.toHaveBeenCalled();
      expect(reportClientErrorMock).toHaveBeenCalledWith(error, {
        component: 'PracticePageIncompleteSession',
        action: 'loadIncompleteSession',
      });
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

      await new Promise((r) => setTimeout(r, 0));

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

      await new Promise((r) => setTimeout(r, 0));

      expect(setSession).not.toHaveBeenCalled();
      expect(setStatus).toHaveBeenCalledTimes(1);
      expect(setStatus).toHaveBeenCalledWith('loading');
      expect(setError).toHaveBeenCalledTimes(1);
      expect(setError).toHaveBeenCalledWith(null);
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
      const error = new Error('boom');
      const endPracticeSessionFn = vi.fn(async () => {
        throw error;
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
      expect(reportClientErrorMock).toHaveBeenCalledWith(error, {
        component: 'PracticePageIncompleteSession',
        action: 'abandonIncompleteSession',
      });
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

      expect(endPracticeSessionFn).not.toHaveBeenCalled();
      expect(setStatus).not.toHaveBeenCalled();
      expect(setError).not.toHaveBeenCalled();
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
