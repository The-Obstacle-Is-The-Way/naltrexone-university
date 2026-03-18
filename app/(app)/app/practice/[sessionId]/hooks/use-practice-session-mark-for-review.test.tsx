// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

const { reportClientErrorMock } = vi.hoisted(() => ({
  reportClientErrorMock: vi.fn(),
}));

vi.mock('@/lib/report-client-error', () => ({
  reportClientError: reportClientErrorMock,
  shouldReportClientError: (error: unknown) =>
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'INTERNAL_ERROR',
}));

import { err, ok } from '@/src/adapters/controllers/action-result';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import { renderHook } from '@/src/application/test-helpers/render-hook';
import { usePracticeSessionMarkForReview } from './use-practice-session-mark-for-review';

describe('usePracticeSessionMarkForReview', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    reportClientErrorMock.mockReset();
  });

  it('returns the expected initial state contract', async () => {
    const output = renderHook(() =>
      usePracticeSessionMarkForReview({
        question: null,
        sessionMode: null,
        sessionInfo: null,
        sessionId: 'session-1',
        applySessionInfo: () => undefined,
        setLoadState: () => undefined,
        setReview: () => undefined,
        isMounted: () => true,
        setPracticeSessionQuestionMarkFn: vi.fn(async () =>
          ok({
            questionId: 'q_1',
            markedForReview: false,
          }),
        ),
      }),
    );

    expect(output.isMarkingForReview).toBe(false);
    expect(typeof output.onToggleMarkForReview).toBe('function');

    await expect(output.onToggleMarkForReview()).resolves.toBeUndefined();
  });

  it('passes an idempotency key when marking for review', async () => {
    const setLoadState = vi.fn();
    const applySessionInfo = vi.fn();
    const setReview = vi.fn();
    const setPracticeSessionQuestionMarkFn = vi.fn(async () =>
      ok({
        questionId: 'q_1',
        markedForReview: true,
      }),
    );

    const sessionInfo = {
      sessionId: 'session-1',
      mode: 'exam' as const,
      index: 0,
      total: 10,
      isMarkedForReview: false,
    };

    const output = renderHook(() =>
      usePracticeSessionMarkForReview({
        question: createNextQuestion(),
        sessionMode: 'exam',
        sessionInfo,
        sessionId: 'session-1',
        applySessionInfo,
        setLoadState,
        setReview,
        isMounted: () => true,
        setPracticeSessionQuestionMarkFn,
      }),
    );

    await output.onToggleMarkForReview();

    expect(setPracticeSessionQuestionMarkFn).toHaveBeenCalledWith({
      sessionId: 'session-1',
      questionId: 'q_1',
      markedForReview: true,
      idempotencyKey: expect.any(String),
    });

    const update = applySessionInfo.mock.calls[0]?.[0];
    if (typeof update !== 'function') {
      throw new Error(
        'Expected applySessionInfo to receive an updater function',
      );
    }

    expect(update(sessionInfo)).toEqual({
      ...sessionInfo,
      isMarkedForReview: true,
    });
    expect(setLoadState).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error' }),
    );
  });

  it('sets loadState error when mark-for-review request throws', async () => {
    const setLoadState = vi.fn();
    const applySessionInfo = vi.fn();
    const setReview = vi.fn();
    const error = new Error('Mark for review failed');

    const setPracticeSessionQuestionMarkFn = vi.fn(async () => {
      throw error;
    });

    const output = renderHook(() =>
      usePracticeSessionMarkForReview({
        question: createNextQuestion(),
        sessionMode: 'exam',
        sessionInfo: {
          sessionId: 'session-1',
          mode: 'exam',
          index: 0,
          total: 10,
          isMarkedForReview: false,
        },
        sessionId: 'session-1',
        applySessionInfo,
        setLoadState,
        setReview,
        isMounted: () => true,
        setPracticeSessionQuestionMarkFn,
      }),
    );

    await output.onToggleMarkForReview();

    expect(setLoadState).toHaveBeenCalledWith({
      status: 'error',
      message: 'Mark for review failed',
    });
    expect(applySessionInfo).not.toHaveBeenCalled();
    expect(setReview).not.toHaveBeenCalled();
    expect(reportClientErrorMock).toHaveBeenCalledWith(error, {
      component: 'UsePracticeSessionMarkForReview',
      action: 'toggleMarkForReview',
    });
  });

  it('sets loadState error when mark-for-review request returns an error result', async () => {
    const setLoadState = vi.fn();
    const applySessionInfo = vi.fn();
    const setReview = vi.fn();

    const setPracticeSessionQuestionMarkFn = vi.fn(async () =>
      err('INTERNAL_ERROR', 'Mark for review failed'),
    );

    const output = renderHook(() =>
      usePracticeSessionMarkForReview({
        question: createNextQuestion(),
        sessionMode: 'exam',
        sessionInfo: {
          sessionId: 'session-1',
          mode: 'exam',
          index: 0,
          total: 10,
          isMarkedForReview: false,
        },
        sessionId: 'session-1',
        applySessionInfo,
        setLoadState,
        setReview,
        isMounted: () => true,
        setPracticeSessionQuestionMarkFn,
      }),
    );

    await output.onToggleMarkForReview();

    expect(setLoadState).toHaveBeenCalledWith({
      status: 'error',
      message: 'Mark for review failed',
    });
    expect(applySessionInfo).not.toHaveBeenCalled();
    expect(setReview).not.toHaveBeenCalled();
    expect(reportClientErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'INTERNAL_ERROR',
        message: 'Mark for review failed',
      }),
      {
        component: 'UsePracticeSessionMarkForReview',
        action: 'toggleMarkForReview',
      },
    );
  });

  it('uses the mutation timeout tier for mark-for-review requests', async () => {
    vi.useFakeTimers();
    try {
      const setLoadState = vi.fn();
      const output = renderHook(() =>
        usePracticeSessionMarkForReview({
          question: createNextQuestion(),
          sessionMode: 'exam',
          sessionInfo: {
            sessionId: 'session-1',
            mode: 'exam',
            index: 0,
            total: 10,
            isMarkedForReview: false,
          },
          sessionId: 'session-1',
          applySessionInfo: vi.fn(),
          setLoadState,
          setReview: vi.fn(),
          isMounted: () => true,
          setPracticeSessionQuestionMarkFn: async () =>
            new Promise<never>(() => {}),
        }),
      );

      const promise = output.onToggleMarkForReview();

      await vi.advanceTimersByTimeAsync(10_000);
      expect(setLoadState).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(5_000);
      await promise;

      expect(setLoadState).toHaveBeenCalledWith({
        status: 'error',
        message: 'Request timed out. Please try again.',
      });
      expect(reportClientErrorMock).toHaveBeenCalledWith(expect.any(Error), {
        component: 'UsePracticeSessionMarkForReview',
        action: 'toggleMarkForReview',
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
