import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';
import { usePracticeSessionMarkForReview } from './use-practice-session-mark-for-review';

const fixtureQuestion1Id = crypto.randomUUID();
const fixtureSession1Id = crypto.randomUUID();

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

    const setPracticeSessionQuestionMarkFn = vi.fn(() => deferred.promise);

    const applySessionInfo = vi.fn();
    const setReview = vi.fn();

    const harness = await renderHook(() =>
      usePracticeSessionMarkForReview({
        question: {
          questionId: fixtureQuestion1Id,
          slug: 'question-1',
          stemMd: 'Question',
          difficulty: 'easy',
          choices: [],
          session: null,
        },
        sessionMode: 'exam',
        sessionInfo: {
          sessionId: fixtureSession1Id,
          mode: 'exam',

          deadlineAt: '2099-05-22T12:02:24.000Z',

          index: 0,
          total: 10,
          isMarkedForReview: false,
        },
        sessionId: fixtureSession1Id,
        applySessionInfo,
        setLoadState: vi.fn(),
        setReview,
        isMounted: () => true,
        setPracticeSessionQuestionMarkFn,
      }),
    );

    const pending = harness.result.current.onToggleMarkForReview();
    await expect
      .poll(() => harness.result.current.isMarkingForReview)
      .toBe(true);

    deferred.resolve(
      ok({
        sessionId: fixtureSession1Id,
        questionId: fixtureQuestion1Id,
        markedForReview: true,
      }),
    );
    await pending;

    await expect
      .poll(() => harness.result.current.isMarkingForReview)
      .toBe(false);

    expect(setPracticeSessionQuestionMarkFn).toHaveBeenCalledWith({
      sessionId: fixtureSession1Id,
      questionId: fixtureQuestion1Id,
      markedForReview: true,
      idempotencyKey: expect.any(String),
    });

    expect(applySessionInfo).toHaveBeenCalledTimes(1);
    const sessionUpdater = applySessionInfo.mock.calls[0]?.[0];
    expect(sessionUpdater).toBeTypeOf('function');
    expect(
      (sessionUpdater as (prev: unknown) => unknown)({
        sessionId: fixtureSession1Id,
        mode: 'exam',

        deadlineAt: '2099-05-22T12:02:24.000Z',

        index: 0,
        total: 10,
        isMarkedForReview: false,
      }),
    ).toEqual({
      sessionId: fixtureSession1Id,
      mode: 'exam',

      deadlineAt: '2099-05-22T12:02:24.000Z',

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
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 1,
        answeredCount: 1,
        markedCount: 0,
        rows: [{ questionId: fixtureQuestion1Id, markedForReview: false }],
      }),
    ).toEqual({
      sessionId: fixtureSession1Id,
      mode: 'exam',
      totalCount: 1,
      answeredCount: 1,
      markedCount: 1,
      rows: [{ questionId: fixtureQuestion1Id, markedForReview: true }],
    });
  });

  it('sets loadState error when mark-for-review request throws', async () => {
    const setPracticeSessionQuestionMarkFn = vi
      .fn()
      .mockRejectedValue(new Error('Mark for review failed'));

    const setLoadState = vi.fn();

    const harness = await renderHook(() =>
      usePracticeSessionMarkForReview({
        question: {
          questionId: fixtureQuestion1Id,
          slug: 'question-1',
          stemMd: 'Question',
          difficulty: 'easy',
          choices: [],
          session: null,
        },
        sessionMode: 'exam',
        sessionInfo: {
          sessionId: fixtureSession1Id,
          mode: 'exam',

          deadlineAt: '2099-05-22T12:02:24.000Z',

          index: 0,
          total: 10,
          isMarkedForReview: false,
        },
        sessionId: fixtureSession1Id,
        applySessionInfo: vi.fn(),
        setLoadState,
        setReview: vi.fn(),
        isMounted: () => true,
        setPracticeSessionQuestionMarkFn,
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
