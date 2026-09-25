import { afterEach, describe, expect, it, vi } from 'vitest';

const fixtureSession1Id = crypto.randomUUID();

const { captureExceptionMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: captureExceptionMock,
}));

import { endSession } from '@/app/(app)/app/practice/[sessionId]/practice-session-page-logic';
import { STANDARD_MUTATION_TIMEOUT_MS } from '@/app/(app)/app/shared/timeout-tiers';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { err, ok } from '@/src/adapters/controllers/action-result';
import type { EndPracticeSessionOutput } from '@/src/adapters/controllers/practice-controller';
import {
  type ApplicationConflictReason,
  ApplicationConflictReasons,
  UserConflictMessages,
} from '@/src/application/errors';
import { createDeferred } from '@/tests/test-helpers/create-deferred';

describe('practice-session-page-logic', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    captureExceptionMock.mockReset();
  });

  describe('endSession', () => {
    const successfulEndSessionOutput: EndPracticeSessionOutput = {
      sessionId: fixtureSession1Id,
      endedAt: '2026-02-01T00:00:00.000Z',
      mode: 'tutor',
      questionCount: 10,
      totals: {
        answered: 10,
        correct: 7,
        accuracy: 0.7,
        durationSeconds: 123,
      },
    };
    const createUnusedGetPracticeSessionSummaryFn = () =>
      vi.fn(async (): Promise<ActionResult<EndPracticeSessionOutput>> => {
        throw new Error('getPracticeSessionSummaryFn should not be called');
      });

    it('sets summary and resets state on success', async () => {
      const setSummary = vi.fn();
      const resetQuestionState = vi.fn();
      const finalizeSessionFn = vi.fn(async () =>
        ok(successfulEndSessionOutput),
      );

      await endSession({
        sessionId: fixtureSession1Id,
        endSessionIdempotencyKey: 'idem_1',
        finalizeSessionFn,
        getPracticeSessionSummaryFn: createUnusedGetPracticeSessionSummaryFn(),
        setLoadState: vi.fn(),
        setSummary,
        resetQuestionState,
      });

      expect(finalizeSessionFn).toHaveBeenCalledWith({
        sessionId: fixtureSession1Id,
        idempotencyKey: 'idem_1',
      });
      expect(setSummary).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: fixtureSession1Id }),
      );
      expect(resetQuestionState).toHaveBeenCalledTimes(1);
    });

    it('sets error state when controller fails', async () => {
      const setLoadState = vi.fn();

      await endSession({
        sessionId: fixtureSession1Id,
        endSessionIdempotencyKey: 'idem_1',
        finalizeSessionFn: async () => err('INTERNAL_ERROR', 'Boom'),
        getPracticeSessionSummaryFn: createUnusedGetPracticeSessionSummaryFn(),
        setLoadState,
        setSummary: vi.fn(),
        resetQuestionState: vi.fn(),
      });

      expect(setLoadState).toHaveBeenCalledWith({
        status: 'error',
        message: 'Boom',
      });
    });

    it('calls rotateIdempotencyKey when controller fails', async () => {
      const rotateIdempotencyKey = vi.fn();

      await endSession({
        sessionId: fixtureSession1Id,
        endSessionIdempotencyKey: 'idem_1',
        finalizeSessionFn: async () => err('INTERNAL_ERROR', 'Boom'),
        getPracticeSessionSummaryFn: createUnusedGetPracticeSessionSummaryFn(),
        setLoadState: vi.fn(),
        setSummary: vi.fn(),
        resetQuestionState: vi.fn(),
        rotateIdempotencyKey,
      });

      expect(rotateIdempotencyKey).toHaveBeenCalledTimes(1);
    });

    it('returns recovered summary state when endPracticeSession returns CONFLICT', async () => {
      const setLoadState = vi.fn();
      const setSummary = vi.fn();
      const resetQuestionState = vi.fn();
      const getPracticeSessionSummaryFn = vi.fn(async () =>
        ok(successfulEndSessionOutput),
      );

      await endSession({
        sessionId: fixtureSession1Id,
        endSessionIdempotencyKey: 'idem_1',
        finalizeSessionFn: async () =>
          err('CONFLICT', 'Practice session already ended'),
        getPracticeSessionSummaryFn,
        setLoadState,
        setSummary,
        resetQuestionState,
      });

      expect(getPracticeSessionSummaryFn).toHaveBeenCalledWith({
        sessionId: fixtureSession1Id,
      });
      expect(setSummary).toHaveBeenCalledWith(successfulEndSessionOutput);
      expect(resetQuestionState).toHaveBeenCalledTimes(1);
      expect(setLoadState).toHaveBeenLastCalledWith({ status: 'ready' });
    });

    it('shows the server error without summary recovery or key rotation for an email-ownership conflict', async () => {
      const setLoadState = vi.fn();
      const rotateIdempotencyKey = vi.fn();
      const getPracticeSessionSummaryFn = vi.fn(async () =>
        err('INTERNAL_ERROR', 'Summary recovery should not run'),
      );

      await endSession({
        sessionId: fixtureSession1Id,
        endSessionIdempotencyKey: 'idem_1',
        finalizeSessionFn: async () =>
          err(
            'CONFLICT',
            UserConflictMessages.EmailOwnedByAnotherIdentity,
            undefined,
            {
              reason:
                ApplicationConflictReasons.UserEmailOwnedByAnotherIdentity,
            },
          ),
        getPracticeSessionSummaryFn,
        setLoadState,
        setSummary: vi.fn(),
        resetQuestionState: vi.fn(),
        rotateIdempotencyKey,
      });

      expect(getPracticeSessionSummaryFn).not.toHaveBeenCalled();
      expect(rotateIdempotencyKey).not.toHaveBeenCalled();
      expect(setLoadState).toHaveBeenLastCalledWith({
        status: 'error',
        message: UserConflictMessages.EmailOwnedByAnotherIdentity,
      });
    });

    it('shows the server error without summary recovery or key rotation for a known non-session conflict', async () => {
      const serverMessage =
        'Request timed out waiting for idempotency key. The concurrent request may still be in progress or may have failed.';
      const setLoadState = vi.fn();
      const rotateIdempotencyKey = vi.fn();
      const getPracticeSessionSummaryFn = vi.fn();

      await endSession({
        sessionId: fixtureSession1Id,
        endSessionIdempotencyKey: 'idem_1',
        finalizeSessionFn: async () =>
          err('CONFLICT', serverMessage, undefined, {
            reason: ApplicationConflictReasons.ConcurrentRequestInProgress,
          }),
        getPracticeSessionSummaryFn,
        setLoadState,
        setSummary: vi.fn(),
        resetQuestionState: vi.fn(),
        rotateIdempotencyKey,
      });

      expect(getPracticeSessionSummaryFn).not.toHaveBeenCalled();
      expect(rotateIdempotencyKey).not.toHaveBeenCalled();
      expect(setLoadState).toHaveBeenLastCalledWith({
        status: 'error',
        message: serverMessage,
      });
    });

    it('shows the server error without summary recovery or key rotation for an unknown conflict reason', async () => {
      const serverMessage = 'A future conflict occurred';
      const setLoadState = vi.fn();
      const rotateIdempotencyKey = vi.fn();
      const getPracticeSessionSummaryFn = vi.fn();
      const unknownConflict = err('CONFLICT', serverMessage, undefined, {
        reason: 'future_conflict_reason' as ApplicationConflictReason,
      });

      await endSession({
        sessionId: fixtureSession1Id,
        endSessionIdempotencyKey: 'idem_1',
        finalizeSessionFn: async () => unknownConflict,
        getPracticeSessionSummaryFn,
        setLoadState,
        setSummary: vi.fn(),
        resetQuestionState: vi.fn(),
        rotateIdempotencyKey,
      });

      expect(getPracticeSessionSummaryFn).not.toHaveBeenCalled();
      expect(rotateIdempotencyKey).not.toHaveBeenCalled();
      expect(setLoadState).toHaveBeenLastCalledWith({
        status: 'error',
        message: serverMessage,
      });
    });

    it('returns an error when summary recovery fails and endPracticeSession returns CONFLICT', async () => {
      const setLoadState = vi.fn();
      const rotateIdempotencyKey = vi.fn();

      await endSession({
        sessionId: fixtureSession1Id,
        endSessionIdempotencyKey: 'idem_1',
        finalizeSessionFn: async () =>
          err('CONFLICT', 'Practice session already ended'),
        getPracticeSessionSummaryFn: async () =>
          err('NOT_FOUND', 'Practice session summary not found'),
        setLoadState,
        setSummary: vi.fn(),
        resetQuestionState: vi.fn(),
        rotateIdempotencyKey,
      });

      expect(rotateIdempotencyKey).toHaveBeenCalledTimes(1);
      expect(setLoadState).toHaveBeenLastCalledWith({
        status: 'error',
        message: 'Practice session summary not found',
      });
    });

    it('returns an error when summary recovery throws and endPracticeSession returns CONFLICT', async () => {
      const setLoadState = vi.fn();
      const rotateIdempotencyKey = vi.fn();
      const error = new Error('Summary fetch failed');

      await endSession({
        sessionId: fixtureSession1Id,
        endSessionIdempotencyKey: 'idem_1',
        finalizeSessionFn: async () =>
          err('CONFLICT', 'Practice session already ended'),
        getPracticeSessionSummaryFn: async () => {
          throw error;
        },
        setLoadState,
        setSummary: vi.fn(),
        resetQuestionState: vi.fn(),
        rotateIdempotencyKey,
      });

      expect(rotateIdempotencyKey).toHaveBeenCalledTimes(1);
      expect(setLoadState).toHaveBeenLastCalledWith({
        status: 'error',
        message: 'Summary fetch failed',
      });
      expect(captureExceptionMock).toHaveBeenCalledWith(error, {
        tags: {
          component: 'PracticeSessionPageLogic',
          action: 'getPracticeSessionSummary',
        },
      });
    });

    it('sets error state when controller throws', async () => {
      const setLoadState = vi.fn();
      const error = new Error('Boom');

      await endSession({
        sessionId: fixtureSession1Id,
        endSessionIdempotencyKey: 'idem_1',
        finalizeSessionFn: async () => {
          throw error;
        },
        getPracticeSessionSummaryFn: createUnusedGetPracticeSessionSummaryFn(),
        setLoadState,
        setSummary: vi.fn(),
        resetQuestionState: vi.fn(),
      });

      expect(setLoadState).toHaveBeenCalledWith({
        status: 'error',
        message: 'Boom',
      });
      expect(captureExceptionMock).toHaveBeenCalledWith(error, {
        tags: {
          component: 'PracticeSessionPageLogic',
          action: 'endSession',
        },
      });
    });

    it('preserves the idempotency key when the controller throws a transport error', async () => {
      const rotateIdempotencyKey = vi.fn();

      await endSession({
        sessionId: fixtureSession1Id,
        endSessionIdempotencyKey: 'idem_1',
        finalizeSessionFn: async () => {
          throw new Error('Boom');
        },
        getPracticeSessionSummaryFn: createUnusedGetPracticeSessionSummaryFn(),
        setLoadState: vi.fn(),
        setSummary: vi.fn(),
        resetQuestionState: vi.fn(),
        rotateIdempotencyKey,
      });

      expect(rotateIdempotencyKey).not.toHaveBeenCalled();
    });

    it('preserves the idempotency key when the controller times out', async () => {
      vi.useFakeTimers();
      try {
        const rotateIdempotencyKey = vi.fn();
        const pending =
          createDeferred<ActionResult<EndPracticeSessionOutput>>();

        const promise = endSession({
          sessionId: fixtureSession1Id,
          endSessionIdempotencyKey: 'idem_1',
          finalizeSessionFn: async () => pending.promise,
          getPracticeSessionSummaryFn:
            createUnusedGetPracticeSessionSummaryFn(),
          setLoadState: vi.fn(),
          setSummary: vi.fn(),
          resetQuestionState: vi.fn(),
          rotateIdempotencyKey,
        });

        await vi.advanceTimersByTimeAsync(STANDARD_MUTATION_TIMEOUT_MS);
        await promise;

        expect(rotateIdempotencyKey).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not call rotateIdempotencyKey on success', async () => {
      const rotateIdempotencyKey = vi.fn();

      await endSession({
        sessionId: fixtureSession1Id,
        endSessionIdempotencyKey: 'idem_1',
        finalizeSessionFn: async () => ok(successfulEndSessionOutput),
        getPracticeSessionSummaryFn: createUnusedGetPracticeSessionSummaryFn(),
        setLoadState: vi.fn(),
        setSummary: vi.fn(),
        resetQuestionState: vi.fn(),
        rotateIdempotencyKey,
      });

      expect(rotateIdempotencyKey).not.toHaveBeenCalled();
    });

    it('returns no state updates when unmounted during endSession', async () => {
      const deferred = createDeferred<ActionResult<EndPracticeSessionOutput>>();
      let mounted = true;

      const setLoadState = vi.fn();
      const setSummary = vi.fn();

      const promise = endSession({
        sessionId: fixtureSession1Id,
        endSessionIdempotencyKey: 'idem_1',
        finalizeSessionFn: async () => deferred.promise,
        getPracticeSessionSummaryFn: createUnusedGetPracticeSessionSummaryFn(),
        setLoadState,
        setSummary,
        resetQuestionState: vi.fn(),
        isMounted: () => mounted,
      });

      mounted = false;
      deferred.resolve(
        ok({
          sessionId: fixtureSession1Id,
          endedAt: '2026-02-01T00:00:00.000Z',
          mode: 'tutor',
          questionCount: 1,
          totals: { answered: 1, correct: 1, accuracy: 1, durationSeconds: 1 },
        }),
      );
      await promise;

      expect(setSummary).not.toHaveBeenCalled();
      expect(setLoadState).not.toHaveBeenCalledWith({ status: 'ready' });
    });
  });
});
