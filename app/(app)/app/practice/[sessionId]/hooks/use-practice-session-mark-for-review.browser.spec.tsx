import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';
import { usePracticeSessionMarkForReview } from './use-practice-session-mark-for-review';

const { setPracticeSessionQuestionMarkMock } = vi.hoisted(() => ({
  setPracticeSessionQuestionMarkMock: vi.fn(),
}));

vi.mock('@/src/adapters/controllers/practice-controller', () => ({
  setPracticeSessionQuestionMark: setPracticeSessionQuestionMarkMock,
}));

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

describe('usePracticeSessionMarkForReview (browser)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('marks the question for review and updates state callbacks', async () => {
    const deferred =
      createDeferred<
        ActionResult<{
          sessionId: string;
          questionId: string;
          markedForReview: boolean;
        }>
      >();

    setPracticeSessionQuestionMarkMock.mockReturnValue(deferred.promise);

    const setSessionInfo = vi.fn();
    const setReview = vi.fn();

    const harness = await renderHook(() =>
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

    const pending = harness.result.current.onToggleMarkForReview();
    await expect
      .poll(() => harness.result.current.isMarkingForReview)
      .toBe(true);

    deferred.resolve(
      ok({
        sessionId: 'session-1',
        questionId: 'question-1',
        markedForReview: true,
      }),
    );
    await pending;

    await expect
      .poll(() => harness.result.current.isMarkingForReview)
      .toBe(false);

    expect(setPracticeSessionQuestionMarkMock).toHaveBeenCalledWith({
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
  });

  it('sets loadState error when mark-for-review request throws', async () => {
    setPracticeSessionQuestionMarkMock.mockRejectedValue(
      new Error('Mark for review failed'),
    );

    const setLoadState = vi.fn();

    const harness = await renderHook(() =>
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

    await harness.result.current.onToggleMarkForReview();
    await expect
      .poll(() => harness.result.current.isMarkingForReview)
      .toBe(false);

    expect(setLoadState).toHaveBeenCalledWith({
      status: 'error',
      message: 'Mark for review failed',
    });
  });
});
