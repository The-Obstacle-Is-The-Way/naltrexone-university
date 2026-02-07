// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@/src/adapters/controllers/action-result';
import * as practiceController from '@/src/adapters/controllers/practice-controller';
import { renderHook } from '@/src/application/test-helpers/render-hook';
import { renderLiveHook } from '@/src/application/test-helpers/render-live-hook';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { usePracticeSessionMarkForReview } from './use-practice-session-mark-for-review';

describe('usePracticeSessionMarkForReview', () => {
  type SessionInfoState = {
    sessionId: string;
    mode: 'exam' | 'tutor';
    index: number;
    total: number;
    isMarkedForReview: boolean;
  } | null;
  type SessionInfoUpdater = (prev: SessionInfoState) => SessionInfoState;

  type ReviewState = {
    sessionId: string;
    mode: 'exam' | 'tutor';
    totalCount: number;
    answeredCount: number;
    markedCount: number;
    rows: Array<{
      questionId: string;
      markedForReview: boolean;
    }>;
  } | null;
  type ReviewUpdater = (prev: ReviewState) => ReviewState;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the expected initial state contract', async () => {
    const output = renderHook(() =>
      usePracticeSessionMarkForReview({
        question: null,
        sessionMode: null,
        sessionInfo: null,
        sessionId: 'session-1',
        setSessionInfo: () => undefined,
        setLoadState: () => undefined,
        setReview: () => undefined,
        isMounted: () => true,
      }),
    );

    expect(output.isMarkingForReview).toBe(false);
    expect(typeof output.onToggleMarkForReview).toBe('function');

    await expect(output.onToggleMarkForReview()).resolves.toBeUndefined();
  });

  it('marks the question for review and updates state callbacks', async () => {
    const deferred =
      createDeferred<
        Awaited<
          ReturnType<typeof practiceController.setPracticeSessionQuestionMark>
        >
      >();
    vi.spyOn(
      practiceController,
      'setPracticeSessionQuestionMark',
    ).mockReturnValue(deferred.promise);

    const setSessionInfo = vi.fn();
    const setReview = vi.fn();

    const harness = renderLiveHook(() =>
      usePracticeSessionMarkForReview({
        question: {
          questionId: 'question-1',
          slug: 'question-1',
          stemMd: 'Question',
          difficulty: 'easy',
          choices: [],
          session: null,
        },
        sessionMode: 'exam',
        sessionInfo: {
          sessionId: 'session-1',
          mode: 'exam',
          index: 0,
          total: 10,
          isMarkedForReview: false,
        },
        sessionId: 'session-1',
        setSessionInfo,
        setLoadState: vi.fn(),
        setReview,
        isMounted: () => true,
      }),
    );

    try {
      await harness.waitFor(() => true);
      const pending = harness.getCurrent().onToggleMarkForReview();
      await harness.waitFor((output) => output.isMarkingForReview);

      deferred.resolve(
        ok({
          sessionId: 'session-1',
          questionId: 'question-1',
          markedForReview: true,
        }),
      );
      await pending;

      await harness.waitFor((output) => !output.isMarkingForReview);

      expect(
        practiceController.setPracticeSessionQuestionMark,
      ).toHaveBeenCalledWith({
        sessionId: 'session-1',
        questionId: 'question-1',
        markedForReview: true,
      });

      expect(setSessionInfo).toHaveBeenCalled();
      const sessionUpdater = setSessionInfo.mock.calls[0]?.[0] as
        | SessionInfoUpdater
        | undefined;
      expect(sessionUpdater).toBeDefined();

      expect(
        sessionUpdater?.({
          sessionId: 'session-1',
          mode: 'exam',
          index: 0,
          total: 10,
          isMarkedForReview: false,
        }),
      ).toEqual({
        sessionId: 'session-1',
        mode: 'exam',
        index: 0,
        total: 10,
        isMarkedForReview: true,
      });

      expect(setReview).toHaveBeenCalled();
      const reviewUpdater = setReview.mock.calls[0]?.[0] as
        | ReviewUpdater
        | undefined;
      expect(reviewUpdater).toBeDefined();

      expect(
        reviewUpdater?.({
          sessionId: 'session-1',
          mode: 'exam',
          totalCount: 1,
          answeredCount: 1,
          markedCount: 0,
          rows: [{ questionId: 'question-1', markedForReview: false }],
        }),
      ).toEqual({
        sessionId: 'session-1',
        mode: 'exam',
        totalCount: 1,
        answeredCount: 1,
        markedCount: 1,
        rows: [{ questionId: 'question-1', markedForReview: true }],
      });
    } finally {
      harness.unmount();
    }
  });

  it('sets loadState error when mark-for-review request throws', async () => {
    vi.spyOn(
      practiceController,
      'setPracticeSessionQuestionMark',
    ).mockRejectedValue(new Error('Mark for review failed'));

    const setLoadState = vi.fn();

    const harness = renderLiveHook(() =>
      usePracticeSessionMarkForReview({
        question: {
          questionId: 'question-1',
          slug: 'question-1',
          stemMd: 'Question',
          difficulty: 'easy',
          choices: [],
          session: null,
        },
        sessionMode: 'exam',
        sessionInfo: {
          sessionId: 'session-1',
          mode: 'exam',
          index: 0,
          total: 10,
          isMarkedForReview: false,
        },
        sessionId: 'session-1',
        setSessionInfo: vi.fn(),
        setLoadState,
        setReview: vi.fn(),
        isMounted: () => true,
      }),
    );

    try {
      await harness.waitFor(() => true);
      await harness.getCurrent().onToggleMarkForReview();
      await harness.waitFor((output) => !output.isMarkingForReview);

      expect(setLoadState).toHaveBeenCalledWith({
        status: 'error',
        message: 'Mark for review failed',
      });
    } finally {
      harness.unmount();
    }
  });
});
