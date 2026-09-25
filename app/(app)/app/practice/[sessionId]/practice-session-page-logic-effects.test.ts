import { afterEach, describe, expect, it, vi } from 'vitest';

const fixtureSession1Id = crypto.randomUUID();

const { captureExceptionMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: captureExceptionMock,
}));

import {
  createNavigatorEffect,
  createSummaryReviewEffect,
} from '@/app/(app)/app/practice/[sessionId]/practice-session-page-logic';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { err, ok } from '@/src/adapters/controllers/action-result';
import type { GetPracticeSessionReviewOutput } from '@/src/adapters/controllers/practice-controller';
import { createDeferred } from '@/tests/test-helpers/create-deferred';

function createFixturePracticeSessionReview(
  overrides: Partial<GetPracticeSessionReviewOutput> = {},
): GetPracticeSessionReviewOutput {
  return {
    sessionId: fixtureSession1Id,
    mode: 'tutor',
    totalCount: 0,
    answeredCount: 0,
    markedCount: 0,
    rows: [],
    ...overrides,
  };
}

describe('practice-session-page-logic effects', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    captureExceptionMock.mockReset();
  });

  describe('createNavigatorEffect', () => {
    it('sets idle state when summary exists', () => {
      const getPracticeSessionReviewFn = vi.fn();
      const setNavigator = vi.fn();
      const setNavigatorLoadState = vi.fn();

      createNavigatorEffect({
        summary: {
          sessionId: fixtureSession1Id,
          endedAt: '2026-02-01T00:00:00.000Z',
          mode: 'tutor',
          questionCount: 1,
          totals: { answered: 1, correct: 1, accuracy: 1, durationSeconds: 1 },
        },
        isInReviewStage: false,
        sessionInfo: null,
        sessionId: fixtureSession1Id,
        getPracticeSessionReviewFn,
        setNavigator,
        setNavigatorLoadState,
      });

      expect(getPracticeSessionReviewFn).not.toHaveBeenCalled();
      expect(setNavigator).toHaveBeenCalledWith(null);
      expect(setNavigatorLoadState).toHaveBeenCalledWith({ status: 'idle' });
    });

    it('sets idle state when review stage is active', () => {
      const getPracticeSessionReviewFn = vi.fn();
      const setNavigator = vi.fn();
      const setNavigatorLoadState = vi.fn();

      createNavigatorEffect({
        summary: null,
        isInReviewStage: true,
        sessionInfo: {
          sessionId: fixtureSession1Id,
          mode: 'tutor',

          deadlineAt: null,

          index: 0,
          total: 2,
        },
        sessionId: fixtureSession1Id,
        getPracticeSessionReviewFn,
        setNavigator,
        setNavigatorLoadState,
      });

      expect(getPracticeSessionReviewFn).not.toHaveBeenCalled();
      expect(setNavigator).toHaveBeenCalledWith(null);
      expect(setNavigatorLoadState).toHaveBeenCalledWith({ status: 'idle' });
    });

    it('loads navigator and transitions to ready on success', async () => {
      const deferred =
        createDeferred<ActionResult<GetPracticeSessionReviewOutput>>();
      const getPracticeSessionReviewFn = vi.fn(async () => deferred.promise);
      const setNavigator = vi.fn();
      const setNavigatorLoadState = vi.fn();
      const navigator = createFixturePracticeSessionReview();

      createNavigatorEffect({
        summary: null,
        isInReviewStage: false,
        sessionInfo: {
          sessionId: fixtureSession1Id,
          mode: 'tutor',

          deadlineAt: null,

          index: 0,
          total: 2,
        },
        sessionId: fixtureSession1Id,
        getPracticeSessionReviewFn,
        setNavigator,
        setNavigatorLoadState,
        isMounted: () => true,
      });

      expect(setNavigatorLoadState).toHaveBeenCalledWith({ status: 'loading' });

      deferred.resolve(ok(navigator));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(setNavigator).toHaveBeenCalledWith(navigator);
      expect(setNavigatorLoadState).toHaveBeenLastCalledWith({
        status: 'ready',
      });
    });

    it('sets error state on non-ok result', async () => {
      const getPracticeSessionReviewFn = vi.fn(async () =>
        err('INTERNAL_ERROR', 'Nope'),
      );
      const setNavigator = vi.fn();
      const setNavigatorLoadState = vi.fn();

      createNavigatorEffect({
        summary: null,
        isInReviewStage: false,
        sessionInfo: {
          sessionId: fixtureSession1Id,
          mode: 'tutor',

          deadlineAt: null,

          index: 0,
          total: 2,
        },
        sessionId: fixtureSession1Id,
        getPracticeSessionReviewFn,
        setNavigator,
        setNavigatorLoadState,
      });

      await new Promise((r) => setTimeout(r, 0));

      expect(setNavigator).toHaveBeenCalledWith(null);
      expect(setNavigatorLoadState).toHaveBeenLastCalledWith({
        status: 'error',
        message: 'Nope',
      });
    });

    it('sets error state when the request throws', async () => {
      const error = new Error('boom');
      const getPracticeSessionReviewFn = vi.fn(async () => {
        throw error;
      });
      const setNavigator = vi.fn();
      const setNavigatorLoadState = vi.fn();

      createNavigatorEffect({
        summary: null,
        isInReviewStage: false,
        sessionInfo: {
          sessionId: fixtureSession1Id,
          mode: 'tutor',

          deadlineAt: null,

          index: 0,
          total: 2,
        },
        sessionId: fixtureSession1Id,
        getPracticeSessionReviewFn,
        setNavigator,
        setNavigatorLoadState,
      });

      await new Promise((r) => setTimeout(r, 0));

      expect(setNavigator).toHaveBeenCalledWith(null);
      expect(setNavigatorLoadState).toHaveBeenLastCalledWith({
        status: 'error',
        message: 'boom',
      });
      expect(captureExceptionMock).toHaveBeenCalledWith(error, {
        tags: {
          component: 'PracticeSessionPageLogic',
          action: 'loadNavigator',
        },
      });
    });
  });

  describe('createSummaryReviewEffect', () => {
    it('sets idle state when summary is null', () => {
      const getPracticeSessionReviewFn = vi.fn();
      const setSummaryReview = vi.fn();
      const setSummaryReviewLoadState = vi.fn();

      createSummaryReviewEffect({
        summary: null,
        sessionId: fixtureSession1Id,
        getPracticeSessionReviewFn,
        setSummaryReview,
        setSummaryReviewLoadState,
      });

      expect(getPracticeSessionReviewFn).not.toHaveBeenCalled();
      expect(setSummaryReview).toHaveBeenCalledWith(null);
      expect(setSummaryReviewLoadState).toHaveBeenCalledWith({
        status: 'idle',
      });
    });

    it('loads review and transitions to ready on success', async () => {
      const deferred =
        createDeferred<ActionResult<GetPracticeSessionReviewOutput>>();
      const getPracticeSessionReviewFn = vi.fn(async () => deferred.promise);
      const setSummaryReview = vi.fn();
      const setSummaryReviewLoadState = vi.fn();
      const summaryReview = createFixturePracticeSessionReview();

      createSummaryReviewEffect({
        summary: {
          sessionId: fixtureSession1Id,
          endedAt: '2026-02-01T00:00:00.000Z',
          mode: 'tutor',
          questionCount: 1,
          totals: { answered: 1, correct: 1, accuracy: 1, durationSeconds: 1 },
        },
        sessionId: fixtureSession1Id,
        getPracticeSessionReviewFn,
        setSummaryReview,
        setSummaryReviewLoadState,
        isMounted: () => true,
      });

      expect(setSummaryReviewLoadState).toHaveBeenCalledWith({
        status: 'loading',
      });

      deferred.resolve(ok(summaryReview));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(setSummaryReview).toHaveBeenLastCalledWith(summaryReview);
      expect(setSummaryReviewLoadState).toHaveBeenLastCalledWith({
        status: 'ready',
      });
    });

    it('sets error state when request throws', async () => {
      const error = new Error('boom');
      const getPracticeSessionReviewFn = vi.fn(async () => {
        throw error;
      });
      const setSummaryReview = vi.fn();
      const setSummaryReviewLoadState = vi.fn();

      createSummaryReviewEffect({
        summary: {
          sessionId: fixtureSession1Id,
          endedAt: '2026-02-01T00:00:00.000Z',
          mode: 'tutor',
          questionCount: 1,
          totals: { answered: 1, correct: 1, accuracy: 1, durationSeconds: 1 },
        },
        sessionId: fixtureSession1Id,
        getPracticeSessionReviewFn,
        setSummaryReview,
        setSummaryReviewLoadState,
      });

      await new Promise((r) => setTimeout(r, 0));

      expect(setSummaryReviewLoadState).toHaveBeenLastCalledWith({
        status: 'error',
        message: 'boom',
      });
      expect(captureExceptionMock).toHaveBeenCalledWith(error, {
        tags: {
          component: 'PracticeSessionPageLogic',
          action: 'loadSummaryReview',
        },
      });
    });

    it('sets error state on non-ok result', async () => {
      const getPracticeSessionReviewFn = vi.fn(async () =>
        err('INTERNAL_ERROR', 'Nope'),
      );
      const setSummaryReview = vi.fn();
      const setSummaryReviewLoadState = vi.fn();

      createSummaryReviewEffect({
        summary: {
          sessionId: fixtureSession1Id,
          endedAt: '2026-02-01T00:00:00.000Z',
          mode: 'tutor',
          questionCount: 1,
          totals: { answered: 1, correct: 1, accuracy: 1, durationSeconds: 1 },
        },
        sessionId: fixtureSession1Id,
        getPracticeSessionReviewFn,
        setSummaryReview,
        setSummaryReviewLoadState,
      });

      await new Promise((r) => setTimeout(r, 0));

      expect(setSummaryReviewLoadState).toHaveBeenLastCalledWith({
        status: 'error',
        message: 'Nope',
      });
      expect(setSummaryReview).toHaveBeenCalledTimes(1);
      expect(setSummaryReview).toHaveBeenLastCalledWith(null);
    });
  });
});
