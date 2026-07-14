import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { err, ok } from '@/src/adapters/controllers/action-result';
import { ApplicationConflictReasons } from '@/src/application/errors';
import { createDeferred } from '@/tests/test-helpers/create-deferred';

const { fixtureSession1Id } = vi.hoisted(() => ({
  fixtureSession1Id: crypto.randomUUID(),
}));

const { reportClientErrorMock } = vi.hoisted(() => ({
  reportClientErrorMock: vi.fn(),
}));

vi.mock('@/lib/report-client-error', () => ({
  reportClientError: reportClientErrorMock,
}));

import {
  abandonIncompleteSession,
  createIncompleteSessionEffect,
  createIncompleteSessionLoadGuard,
  loadIncompleteSession,
  resolveAbandonRequestToken,
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
          ok({ sessionId: fixtureSession1Id }),
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
      expect(setSession).toHaveBeenCalledWith({ sessionId: fixtureSession1Id });
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
      deferred.resolve(ok({ sessionId: fixtureSession1Id }));

      await new Promise((r) => setTimeout(r, 0));

      expect(setSession).not.toHaveBeenCalled();
      expect(setStatus).toHaveBeenCalledTimes(1);
      expect(setStatus).toHaveBeenCalledWith('loading');
      expect(setError).toHaveBeenCalledTimes(1);
      expect(setError).toHaveBeenCalledWith(null);
    });
  });

  describe('loadIncompleteSession', () => {
    it('returns a typed loaded outcome for an authoritative absence', async () => {
      const setStatus = vi.fn();
      const setError = vi.fn();
      const setSession = vi.fn();

      const outcome = await loadIncompleteSession({
        getIncompletePracticeSessionFn: async () => ok(null),
        setIncompleteSessionStatus: setStatus,
        setIncompleteSessionError: setError,
        setIncompleteSession: setSession,
      });

      expect(outcome).toEqual({ kind: 'loaded', session: null });
      expect(setSession).toHaveBeenCalledWith(null);
      expect(setStatus).toHaveBeenLastCalledWith('idle');
    });

    it('returns a typed failure without replacing the last session', async () => {
      const setSession = vi.fn();

      const outcome = await loadIncompleteSession({
        getIncompletePracticeSessionFn: async () =>
          err('INTERNAL_ERROR', 'Refresh failed'),
        setIncompleteSessionStatus: vi.fn(),
        setIncompleteSessionError: vi.fn(),
        setIncompleteSession: setSession,
      });

      expect(outcome).toEqual({ kind: 'failed' });
      expect(setSession).not.toHaveBeenCalled();
    });

    it('does not let an older successful load overwrite a newer one', async () => {
      const older =
        createDeferred<ActionResult<{ sessionId: string } | null>>();
      const newer =
        createDeferred<ActionResult<{ sessionId: string } | null>>();
      const newerSessionId = crypto.randomUUID();
      const state = {
        status: 'idle' as 'idle' | 'loading' | 'error',
        error: null as string | null,
        session: null as { sessionId: string } | null,
      };
      const getIncompletePracticeSessionFn = vi
        .fn()
        .mockReturnValueOnce(older.promise)
        .mockReturnValueOnce(newer.promise);
      const loadGuard = createIncompleteSessionLoadGuard();
      const input = {
        getIncompletePracticeSessionFn,
        setIncompleteSessionStatus: (status: 'idle' | 'loading' | 'error') => {
          state.status = status;
        },
        setIncompleteSessionError: (error: string | null) => {
          state.error = error;
        },
        setIncompleteSession: (session: { sessionId: string } | null) => {
          state.session = session;
        },
        loadGuard,
      };

      const olderLoad = loadIncompleteSession(input);
      const newerLoad = loadIncompleteSession(input);
      newer.resolve(ok({ sessionId: newerSessionId }));
      const newerOutcome = await newerLoad;
      older.resolve(ok({ sessionId: fixtureSession1Id }));
      const olderOutcome = await olderLoad;

      expect(state).toEqual({
        status: 'idle',
        error: null,
        session: { sessionId: newerSessionId },
      });
      expect(newerOutcome).toEqual({
        kind: 'loaded',
        session: { sessionId: newerSessionId },
      });
      expect(olderOutcome).toEqual({ kind: 'ignored' });
    });

    it('does not let an older rejected load replace a newer success', async () => {
      const older =
        createDeferred<ActionResult<{ sessionId: string } | null>>();
      const newer =
        createDeferred<ActionResult<{ sessionId: string } | null>>();
      const state = {
        status: 'idle' as 'idle' | 'loading' | 'error',
        error: null as string | null,
        session: null as { sessionId: string } | null,
      };
      const getIncompletePracticeSessionFn = vi
        .fn()
        .mockReturnValueOnce(older.promise)
        .mockReturnValueOnce(newer.promise);
      const loadGuard = createIncompleteSessionLoadGuard();
      const input = {
        getIncompletePracticeSessionFn,
        setIncompleteSessionStatus: (status: 'idle' | 'loading' | 'error') => {
          state.status = status;
        },
        setIncompleteSessionError: (error: string | null) => {
          state.error = error;
        },
        setIncompleteSession: (session: { sessionId: string } | null) => {
          state.session = session;
        },
        loadGuard,
      };

      const olderLoad = loadIncompleteSession(input);
      const newerLoad = loadIncompleteSession(input);
      newer.resolve(ok({ sessionId: fixtureSession1Id }));
      await newerLoad;
      older.reject(new Error('stale failure'));
      await olderLoad;

      expect(state).toEqual({
        status: 'idle',
        error: null,
        session: { sessionId: fixtureSession1Id },
      });
      expect(reportClientErrorMock).not.toHaveBeenCalled();
    });
  });

  describe('resolveAbandonRequestToken', () => {
    it('reuses the stored token for the session it was minted for', () => {
      const token = { sessionId: fixtureSession1Id, key: crypto.randomUUID() };

      const resolved = resolveAbandonRequestToken(
        token,
        fixtureSession1Id,
        () => crypto.randomUUID(),
      );

      expect(resolved).toBe(token);
    });

    it('mints a fresh token when the target session differs', () => {
      const otherSessionId = crypto.randomUUID();
      const token = { sessionId: otherSessionId, key: crypto.randomUUID() };
      const freshKey = crypto.randomUUID();

      // A key that carried one session's abandon must never travel with a
      // different session: the wrapper would replay the completed outcome and
      // the new session would never end.
      const resolved = resolveAbandonRequestToken(
        token,
        fixtureSession1Id,
        () => freshKey,
      );

      expect(resolved).toEqual({
        sessionId: fixtureSession1Id,
        key: freshKey,
      });
    });

    it('mints a token when none is stored', () => {
      const freshKey = crypto.randomUUID();

      const resolved = resolveAbandonRequestToken(
        null,
        fixtureSession1Id,
        () => freshKey,
      );

      expect(resolved).toEqual({
        sessionId: fixtureSession1Id,
        key: freshKey,
      });
    });
  });

  describe('abandonIncompleteSession', () => {
    it('ends a tutor session and clears local state on success', async () => {
      const setStatus = vi.fn();
      const setError = vi.fn();
      const setSession = vi.fn();
      const endPracticeSessionFn = vi.fn(async () => ok({}));
      const discardPracticeSessionFn = vi.fn(async () => ok({}));

      await abandonIncompleteSession({
        sessionId: fixtureSession1Id,
        idempotencyKey: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        mode: 'tutor',
        endPracticeSessionFn,
        discardPracticeSessionFn,
        setIncompleteSessionStatus: setStatus,
        setIncompleteSessionError: setError,
        setIncompleteSession: setSession,
        isMounted: () => true,
      });

      expect(endPracticeSessionFn).toHaveBeenCalledWith({
        sessionId: fixtureSession1Id,
        idempotencyKey: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      });
      expect(discardPracticeSessionFn).not.toHaveBeenCalled();
      expect(setSession).toHaveBeenCalledWith(null);
      expect(setStatus).toHaveBeenLastCalledWith('idle');
    });

    it('discards an exam session and clears local state on success', async () => {
      const setStatus = vi.fn();
      const setError = vi.fn();
      const setSession = vi.fn();
      const endPracticeSessionFn = vi.fn(async () => ok({}));
      const discardPracticeSessionFn = vi.fn(async () => ok({}));

      await abandonIncompleteSession({
        sessionId: fixtureSession1Id,
        idempotencyKey: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        mode: 'exam',
        endPracticeSessionFn,
        discardPracticeSessionFn,
        setIncompleteSessionStatus: setStatus,
        setIncompleteSessionError: setError,
        setIncompleteSession: setSession,
        isMounted: () => true,
      });

      expect(discardPracticeSessionFn).toHaveBeenCalledWith({
        sessionId: fixtureSession1Id,
        idempotencyKey: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      });
      expect(endPracticeSessionFn).not.toHaveBeenCalled();
      expect(setSession).toHaveBeenCalledWith(null);
      expect(setStatus).toHaveBeenLastCalledWith('idle');
    });

    it('rotates the abandon idempotency key and reports success after a consumed success', async () => {
      const rotateIdempotencyKey = vi.fn();
      const endPracticeSessionFn = vi.fn(async () => ok({}));

      const abandoned = await abandonIncompleteSession({
        sessionId: fixtureSession1Id,
        idempotencyKey: '99999999-9999-4999-8999-999999999999',
        rotateIdempotencyKey,
        mode: 'tutor',
        endPracticeSessionFn,
        discardPracticeSessionFn: vi.fn(async () => ok({})),
        setIncompleteSessionStatus: vi.fn(),
        setIncompleteSessionError: vi.fn(),
        setIncompleteSession: vi.fn(),
        isMounted: () => true,
      });

      // A consumed success is terminal for this key: the panel clears, so any
      // later abandon necessarily targets a different session and must not
      // replay this outcome.
      expect(rotateIdempotencyKey).toHaveBeenCalledTimes(1);
      expect(abandoned).toBe(true);
    });

    it('reports failure for a non-ok result and a thrown request', async () => {
      const base = {
        sessionId: fixtureSession1Id,
        mode: 'tutor' as const,
        discardPracticeSessionFn: vi.fn(async () => ok({})),
        setIncompleteSessionStatus: vi.fn(),
        setIncompleteSessionError: vi.fn(),
        setIncompleteSession: vi.fn(),
        isMounted: () => true,
      };

      await expect(
        abandonIncompleteSession({
          ...base,
          idempotencyKey: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
          endPracticeSessionFn: vi.fn(async () => err('INTERNAL_ERROR', 'no')),
        }),
      ).resolves.toBe(false);

      await expect(
        abandonIncompleteSession({
          ...base,
          idempotencyKey: 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb',
          endPracticeSessionFn: vi.fn(async () => {
            throw new Error('boom');
          }),
        }),
      ).resolves.toBe(false);
    });

    it('sets error state when the request throws and is still mounted', async () => {
      const setStatus = vi.fn();
      const setError = vi.fn();
      const setSession = vi.fn();
      const rotateIdempotencyKey = vi.fn();
      const error = new Error('boom');
      const endPracticeSessionFn = vi.fn(async () => {
        throw error;
      });
      const discardPracticeSessionFn = vi.fn(async () => ok({}));

      await abandonIncompleteSession({
        sessionId: fixtureSession1Id,
        idempotencyKey: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        rotateIdempotencyKey,
        mode: 'tutor',
        endPracticeSessionFn,
        discardPracticeSessionFn,
        setIncompleteSessionStatus: setStatus,
        setIncompleteSessionError: setError,
        setIncompleteSession: setSession,
        isMounted: () => true,
      });

      expect(setStatus).toHaveBeenLastCalledWith('error');
      expect(setError).toHaveBeenLastCalledWith('boom');
      // A thrown transport/timeout error is outcome-indeterminate: the
      // preserved key is the only handle to a possibly-committed abandon.
      expect(rotateIdempotencyKey).not.toHaveBeenCalled();
      expect(setSession).not.toHaveBeenCalled();
      expect(reportClientErrorMock).toHaveBeenCalledWith(error, {
        component: 'PracticePageIncompleteSession',
        action: 'abandonIncompleteSession',
      });
    });

    it('preserves the abandon idempotency key for a non-cached internal error', async () => {
      const setStatus = vi.fn();
      const setError = vi.fn();
      const setSession = vi.fn();
      const rotateIdempotencyKey = vi.fn();
      const endPracticeSessionFn = vi.fn(async () =>
        err('INTERNAL_ERROR', 'Nope'),
      );
      const discardPracticeSessionFn = vi.fn(async () => ok({}));

      await abandonIncompleteSession({
        sessionId: fixtureSession1Id,
        idempotencyKey: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        rotateIdempotencyKey,
        mode: 'tutor',
        endPracticeSessionFn,
        discardPracticeSessionFn,
        setIncompleteSessionStatus: setStatus,
        setIncompleteSessionError: setError,
        setIncompleteSession: setSession,
        isMounted: () => true,
      });

      expect(endPracticeSessionFn).toHaveBeenCalledWith({
        sessionId: fixtureSession1Id,
        idempotencyKey: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      });
      // The lifecycle policy aborts the claim for INTERNAL_ERROR, so the
      // same-key retry re-executes; rotating would orphan that path.
      expect(rotateIdempotencyKey).not.toHaveBeenCalled();
      expect(setStatus).toHaveBeenLastCalledWith('error');
      expect(setError).toHaveBeenLastCalledWith('Nope');
    });

    it('does not infer resolution or rotate the key from a bare conflict', async () => {
      const setStatus = vi.fn();
      const setError = vi.fn();
      const setSession = vi.fn();
      const rotateIdempotencyKey = vi.fn();
      const endPracticeSessionFn = vi.fn(async () =>
        err('CONFLICT', 'Practice session already ended'),
      );
      const discardPracticeSessionFn = vi.fn(async () => ok({}));

      await abandonIncompleteSession({
        sessionId: fixtureSession1Id,
        idempotencyKey: '11111111-2222-3333-4444-555555555555',
        rotateIdempotencyKey,
        mode: 'tutor',
        endPracticeSessionFn,
        discardPracticeSessionFn,
        setIncompleteSessionStatus: setStatus,
        setIncompleteSessionError: setError,
        setIncompleteSession: setSession,
        isMounted: () => true,
      });

      // The abandon surface emits a bare conflict. Only an authoritative
      // refresh can establish resolution; broad-code/message inference would
      // discard the same-key retry handle on an unproven state.
      expect(rotateIdempotencyKey).not.toHaveBeenCalled();
      expect(setStatus).toHaveBeenLastCalledWith('error');
      expect(setSession).not.toHaveBeenCalled();
    });

    it('preserves the abandon idempotency key on a concurrent-request conflict', async () => {
      const setStatus = vi.fn();
      const setError = vi.fn();
      const setSession = vi.fn();
      const rotateIdempotencyKey = vi.fn();
      const endPracticeSessionFn = vi.fn(async () =>
        err('CONFLICT', 'Request already in progress', undefined, {
          reason: ApplicationConflictReasons.ConcurrentRequestInProgress,
        }),
      );
      const discardPracticeSessionFn = vi.fn(async () => ok({}));

      await abandonIncompleteSession({
        sessionId: fixtureSession1Id,
        idempotencyKey: '66666666-7777-8888-9999-aaaaaaaaaaaa',
        rotateIdempotencyKey,
        mode: 'tutor',
        endPracticeSessionFn,
        discardPracticeSessionFn,
        setIncompleteSessionStatus: setStatus,
        setIncompleteSessionError: setError,
        setIncompleteSession: setSession,
        isMounted: () => true,
      });

      // The original request may still be running; the preserved key is the
      // handle to its recorded outcome.
      expect(rotateIdempotencyKey).not.toHaveBeenCalled();
      expect(setStatus).toHaveBeenLastCalledWith('error');
    });

    it('does not set error state when unmounted after a thrown request', async () => {
      const setStatus = vi.fn();
      const setError = vi.fn();
      const setSession = vi.fn();
      const endPracticeSessionFn = vi.fn(async () => {
        throw new Error('boom');
      });
      const discardPracticeSessionFn = vi.fn(async () => ok({}));

      await abandonIncompleteSession({
        sessionId: fixtureSession1Id,
        idempotencyKey: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        mode: 'tutor',
        endPracticeSessionFn,
        discardPracticeSessionFn,
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
      const discardPracticeSessionFn = vi.fn(async () => ok({}));

      await abandonIncompleteSession({
        sessionId: fixtureSession1Id,
        idempotencyKey: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
        mode: 'tutor',
        endPracticeSessionFn,
        discardPracticeSessionFn,
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
