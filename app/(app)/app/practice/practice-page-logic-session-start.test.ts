import { describe, expect, it, vi } from 'vitest';
import { startSession } from '@/app/(app)/app/practice/practice-page-logic';
import { toPracticeSessionRoute } from '@/lib/routes';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { err, ok } from '@/src/adapters/controllers/action-result';
import { createDeferred } from '@/tests/test-helpers/create-deferred';

const { fixtureSession1Id } = vi.hoisted(() => ({
  fixtureSession1Id: crypto.randomUUID(),
}));

describe('practice-page-logic session start', () => {
  describe('startSession', () => {
    it('sets error state when controller fails', async () => {
      const setSessionStartStatus = vi.fn();
      const setSessionStartError = vi.fn();
      const setIdempotencyKey = vi.fn();

      await startSession({
        sessionMode: 'tutor',
        sessionCount: 20,
        filters: {
          tagSlugs: ['alcohol'],
          difficulty: null,
          status: 'unanswered',
        },
        idempotencyKey: 'idem_1',
        createIdempotencyKey: () => 'idem_2',
        setIdempotencyKey,
        startPracticeSessionFn: async () => err('NOT_FOUND', 'No questions'),
        setSessionStartStatus,
        setSessionStartError,
        navigateTo: vi.fn(),
      });

      expect(setSessionStartStatus).toHaveBeenCalledWith('error');
      expect(setSessionStartError).toHaveBeenCalledWith('No questions');
      expect(setIdempotencyKey).toHaveBeenCalledWith('idem_2');
    });

    it('navigates to the session route on success without toast params when counts match', async () => {
      const startPracticeSessionFn = vi.fn(async () =>
        ok({
          sessionId: fixtureSession1Id,
          requestedCount: 10,
          actualCount: 10,
        }),
      );
      const navigateTo = vi.fn();
      const setIdempotencyKey = vi.fn();

      await startSession({
        sessionMode: 'exam',
        sessionCount: 10,
        filters: {
          tagSlugs: ['opioids'],
          difficulty: 'hard',
          status: 'unanswered',
        },
        idempotencyKey: 'idem_1',
        createIdempotencyKey: () => 'idem_2',
        setIdempotencyKey,
        startPracticeSessionFn,
        setSessionStartStatus: vi.fn(),
        setSessionStartError: vi.fn(),
        navigateTo,
      });

      expect(startPracticeSessionFn).toHaveBeenCalledWith({
        mode: 'exam',
        count: 10,
        idempotencyKey: 'idem_1',
        tagSlugs: ['opioids'],
        difficulties: ['hard'],
        statuses: ['unanswered'],
      });
      expect(navigateTo).toHaveBeenCalledWith(
        toPracticeSessionRoute(fixtureSession1Id),
      );
      expect(setIdempotencyKey).not.toHaveBeenCalled();
    });

    it('includes requested/actual counts in the session_started toast when fewer questions are available than requested', async () => {
      const startPracticeSessionFn = vi.fn(async () =>
        ok({
          sessionId: fixtureSession1Id,
          requestedCount: 50,
          actualCount: 30,
        }),
      );
      const navigateTo = vi.fn();

      await startSession({
        sessionMode: 'exam',
        sessionCount: 50,
        filters: { tagSlugs: [], difficulty: null, status: 'unanswered' },
        idempotencyKey: 'idem_1',
        createIdempotencyKey: () => 'idem_2',
        setIdempotencyKey: vi.fn(),
        startPracticeSessionFn,
        setSessionStartStatus: vi.fn(),
        setSessionStartError: vi.fn(),
        navigateTo,
      });

      expect(navigateTo).toHaveBeenCalledWith(
        `${toPracticeSessionRoute(fixtureSession1Id)}?toast=session_started&requestedCount=50&actualCount=30`,
      );
    });

    it('sets error state when controller throws', async () => {
      const setSessionStartStatus = vi.fn();
      const setSessionStartError = vi.fn();
      const setIdempotencyKey = vi.fn();

      await startSession({
        sessionMode: 'tutor',
        sessionCount: 20,
        filters: {
          tagSlugs: ['alcohol'],
          difficulty: null,
          status: 'unanswered',
        },
        idempotencyKey: 'idem_1',
        createIdempotencyKey: () => 'idem_2',
        setIdempotencyKey,
        startPracticeSessionFn: async () => {
          throw new Error('Boom');
        },
        setSessionStartStatus,
        setSessionStartError,
        navigateTo: vi.fn(),
      });

      expect(setSessionStartStatus).toHaveBeenCalledWith('error');
      expect(setSessionStartError).toHaveBeenCalledWith('Boom');
      expect(setIdempotencyKey).toHaveBeenCalledWith('idem_2');
    });

    it('reports thrown session start errors while preserving error UI state', async () => {
      const error = new Error('Boom');
      const reportError = vi.fn();
      const setSessionStartStatus = vi.fn();
      const setSessionStartError = vi.fn();
      const setIdempotencyKey = vi.fn();

      await startSession({
        sessionMode: 'tutor',
        sessionCount: 20,
        filters: {
          tagSlugs: ['alcohol'],
          difficulty: null,
          status: 'unanswered',
        },
        idempotencyKey: 'idem_1',
        createIdempotencyKey: () => 'idem_2',
        setIdempotencyKey,
        startPracticeSessionFn: async () => {
          throw error;
        },
        reportError,
        setSessionStartStatus,
        setSessionStartError,
        navigateTo: vi.fn(),
      });

      expect(reportError).toHaveBeenCalledWith(error, {
        action: 'startSession',
      });
      expect(setSessionStartStatus).toHaveBeenCalledWith('error');
      expect(setSessionStartError).toHaveBeenCalledWith('Boom');
      expect(setIdempotencyKey).toHaveBeenCalledWith('idem_2');
    });

    it('preserves session start error handling when reportError throws', async () => {
      const error = new Error('Boom');
      const reportError = vi.fn(() => {
        throw new Error('reporter failed');
      });
      const setSessionStartStatus = vi.fn();
      const setSessionStartError = vi.fn();
      const setIdempotencyKey = vi.fn();

      await expect(
        startSession({
          sessionMode: 'tutor',
          sessionCount: 20,
          filters: {
            tagSlugs: ['alcohol'],
            difficulty: null,
            status: 'unanswered',
          },
          idempotencyKey: 'idem_1',
          createIdempotencyKey: () => 'idem_2',
          setIdempotencyKey,
          startPracticeSessionFn: async () => {
            throw error;
          },
          reportError,
          setSessionStartStatus,
          setSessionStartError,
          navigateTo: vi.fn(),
        }),
      ).resolves.toBeUndefined();

      expect(reportError).toHaveBeenCalledWith(error, {
        action: 'startSession',
      });
      expect(setSessionStartStatus).toHaveBeenCalledWith('error');
      expect(setSessionStartError).toHaveBeenCalledWith('Boom');
      expect(setIdempotencyKey).toHaveBeenCalledWith('idem_2');
    });

    it('returns without navigating when unmounted during startSession', async () => {
      const deferred =
        createDeferred<
          ActionResult<{
            sessionId: string;
            requestedCount: number;
            actualCount: number;
          }>
        >();
      let mounted = true;

      const navigateTo = vi.fn();

      const promise = startSession({
        sessionMode: 'exam',
        sessionCount: 10,
        filters: {
          tagSlugs: ['opioids'],
          difficulty: 'hard',
          status: 'unanswered',
        },
        idempotencyKey: 'idem_1',
        createIdempotencyKey: () => 'idem_2',
        setIdempotencyKey: vi.fn(),
        startPracticeSessionFn: async () => deferred.promise,
        setSessionStartStatus: vi.fn(),
        setSessionStartError: vi.fn(),
        navigateTo,
        isMounted: () => mounted,
      });

      mounted = false;
      deferred.resolve(
        ok({
          sessionId: fixtureSession1Id,
          requestedCount: 10,
          actualCount: 10,
        }),
      );
      await promise;

      expect(navigateTo).not.toHaveBeenCalled();
    });

    it('reports thrown session start errors after unmount without applying error UI state', async () => {
      const deferred =
        createDeferred<
          ActionResult<{
            sessionId: string;
            requestedCount: number;
            actualCount: number;
          }>
        >();
      const error = new Error('Boom');
      let mounted = true;

      const reportError = vi.fn();
      const setSessionStartStatus = vi.fn();
      const setSessionStartError = vi.fn();
      const setIdempotencyKey = vi.fn();

      const promise = startSession({
        sessionMode: 'exam',
        sessionCount: 10,
        filters: {
          tagSlugs: ['opioids'],
          difficulty: 'hard',
          status: 'unanswered',
        },
        idempotencyKey: 'idem_1',
        createIdempotencyKey: () => 'idem_2',
        setIdempotencyKey,
        startPracticeSessionFn: async () => deferred.promise,
        reportError,
        setSessionStartStatus,
        setSessionStartError,
        navigateTo: vi.fn(),
        isMounted: () => mounted,
      });

      mounted = false;
      deferred.reject(error);
      await promise;

      expect(reportError).toHaveBeenCalledWith(error, {
        action: 'startSession',
      });
      expect(setSessionStartStatus).not.toHaveBeenCalledWith('error');
      expect(setSessionStartError).not.toHaveBeenCalledWith('Boom');
      expect(setIdempotencyKey).not.toHaveBeenCalledWith('idem_2');
    });
  });
});
