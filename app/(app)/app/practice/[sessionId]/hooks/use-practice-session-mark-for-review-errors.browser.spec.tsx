import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import type { LoadState } from '@/app/(app)/app/practice/practice-page-logic';
import { useIsMounted } from '@/lib/use-is-mounted';
import { err, ok } from '@/src/adapters/controllers/action-result';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { GetPracticeSessionReviewOutput } from '@/src/application/use-cases/get-practice-session-review';
import {
  type SetPracticeSessionQuestionMarkFn,
  usePracticeSessionMarkForReview,
} from './use-practice-session-mark-for-review';

const { captureExceptionMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: captureExceptionMock,
}));

const questionId = crypto.randomUUID();
const sessionId = crypto.randomUUID();
const initialSessionInfo: NonNullable<NextQuestion['session']> = {
  sessionId,
  mode: 'exam',
  deadlineAt: '2099-05-22T12:02:24.000Z',
  index: 0,
  total: 1,
  isMarkedForReview: false,
};
const question = createNextQuestion({ questionId });
const initialReview: GetPracticeSessionReviewOutput = {
  sessionId,
  mode: 'exam',
  totalCount: 1,
  answeredCount: 0,
  markedCount: 0,
  rows: [
    {
      isAvailable: false,
      questionId,
      order: 1,
      isAnswered: false,
      isCorrect: null,
      isOmitted: false,
      markedForReview: false,
    },
  ],
};
const reportContext = {
  tags: {
    component: 'UsePracticeSessionMarkForReview',
    action: 'toggleMarkForReview',
  },
};
function renderMarkHook(request: SetPracticeSessionQuestionMarkFn) {
  return renderHook(() => {
    const isMounted = useIsMounted();
    const [loadState, setLoadState] = useState<LoadState>({ status: 'ready' });
    const [sessionInfo, setSessionInfo] =
      useState<NextQuestion['session']>(initialSessionInfo);
    const [review, setReview] = useState<GetPracticeSessionReviewOutput | null>(
      initialReview,
    );
    const mark = usePracticeSessionMarkForReview({
      question,
      sessionMode: 'exam',
      sessionInfo,
      sessionId,
      applySessionInfo: setSessionInfo,
      setLoadState,
      setReview,
      isMounted,
      setPracticeSessionQuestionMarkFn: request,
    });
    return { ...mark, loadState, sessionInfo, review };
  });
}

describe('mark-for-review state and reporter boundary (browser)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    captureExceptionMock.mockReset();
  });

  it('sends an idempotency key and updates real session and review state on success', async () => {
    const request = vi.fn<SetPracticeSessionQuestionMarkFn>(async () =>
      ok({ questionId, markedForReview: true }),
    );
    const harness = await renderMarkHook(request);

    await harness.result.current.onToggleMarkForReview();

    expect(request).toHaveBeenCalledWith({
      sessionId,
      questionId,
      markedForReview: true,
      idempotencyKey: expect.any(String),
    });
    await expect
      .poll(() => harness.result.current.sessionInfo)
      .toEqual({ ...initialSessionInfo, isMarkedForReview: true });
    expect(harness.result.current.review).toEqual({
      ...initialReview,
      markedCount: 1,
      rows: [{ ...initialReview.rows[0], markedForReview: true }],
    });
    expect(harness.result.current.loadState).toEqual({ status: 'ready' });
    expect(harness.result.current.isMarkingForReview).toBe(false);
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it('reports a thrown error, preserves state and reuses the indeterminate request key', async () => {
    const error = new Error('Mark for review failed');
    const request = vi
      .fn<SetPracticeSessionQuestionMarkFn>()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(ok({ questionId, markedForReview: true }));
    const harness = await renderMarkHook(request);

    await harness.result.current.onToggleMarkForReview();

    await expect
      .poll(() => harness.result.current.loadState)
      .toEqual({
        status: 'error',
        message: 'Mark for review failed',
      });
    expect(harness.result.current.sessionInfo).toEqual(initialSessionInfo);
    expect(harness.result.current.review).toEqual(initialReview);
    expect(captureExceptionMock).toHaveBeenCalledWith(error, reportContext);
    const firstKey = request.mock.calls[0]?.[0].idempotencyKey;
    expect(firstKey).toEqual(expect.any(String));

    await harness.result.current.onToggleMarkForReview();

    expect(request.mock.calls[1]?.[0].idempotencyKey).toBe(firstKey);
    await expect
      .poll(() => harness.result.current.sessionInfo?.isMarkedForReview)
      .toBe(true);
  });

  it('reports an INTERNAL_ERROR result without changing session or review state', async () => {
    const request: SetPracticeSessionQuestionMarkFn = async () =>
      err('INTERNAL_ERROR', 'Mark for review failed');
    const harness = await renderMarkHook(request);

    await harness.result.current.onToggleMarkForReview();

    await expect
      .poll(() => harness.result.current.loadState)
      .toEqual({
        status: 'error',
        message: 'Mark for review failed',
      });
    expect(harness.result.current.sessionInfo).toEqual(initialSessionInfo);
    expect(harness.result.current.review).toEqual(initialReview);
    expect(captureExceptionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'INTERNAL_ERROR',
        message: 'Mark for review failed',
      }),
      reportContext,
    );
  });

  it('reports NOT_FOUND and rotates the key after a determinate cached failure', async () => {
    const request = vi
      .fn<SetPracticeSessionQuestionMarkFn>()
      .mockResolvedValueOnce(err('NOT_FOUND', 'Question not found'))
      .mockResolvedValueOnce(ok({ questionId, markedForReview: true }));
    const harness = await renderMarkHook(request);

    await harness.result.current.onToggleMarkForReview();

    await expect
      .poll(() => harness.result.current.loadState)
      .toEqual({
        status: 'error',
        message: 'Question not found',
      });
    expect(harness.result.current.sessionInfo).toEqual(initialSessionInfo);
    expect(harness.result.current.review).toEqual(initialReview);
    expect(captureExceptionMock).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'NOT_FOUND' }),
      reportContext,
    );
    const firstKey = request.mock.calls[0]?.[0].idempotencyKey;

    await harness.result.current.onToggleMarkForReview();

    const secondKey = request.mock.calls[1]?.[0].idempotencyKey;
    expect(firstKey).toEqual(expect.any(String));
    expect(secondKey).toEqual(expect.any(String));
    expect(secondKey).not.toBe(firstKey);
  });

  it('shows RATE_LIMITED without reporting an expected business outcome', async () => {
    const request: SetPracticeSessionQuestionMarkFn = async () =>
      err('RATE_LIMITED', 'Please wait before trying again');
    const harness = await renderMarkHook(request);

    await harness.result.current.onToggleMarkForReview();

    await expect
      .poll(() => harness.result.current.loadState)
      .toEqual({
        status: 'error',
        message: 'Please wait before trying again',
      });
    expect(harness.result.current.sessionInfo).toEqual(initialSessionInfo);
    expect(harness.result.current.review).toEqual(initialReview);
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it('waits past the read tier then reports the 15-second mutation timeout', async () => {
    vi.useFakeTimers();
    const request: SetPracticeSessionQuestionMarkFn = async () =>
      new Promise<never>(() => {});
    const harness = await renderMarkHook(request);

    const pending = harness.result.current.onToggleMarkForReview();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(harness.result.current.loadState).toEqual({ status: 'ready' });
    expect(captureExceptionMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5_000);
    await pending;

    await expect
      .poll(() => harness.result.current.loadState)
      .toEqual({
        status: 'error',
        message: 'Request timed out. Please try again.',
      });
    expect(harness.result.current.sessionInfo).toEqual(initialSessionInfo);
    expect(harness.result.current.review).toEqual(initialReview);
    expect(captureExceptionMock).toHaveBeenCalledWith(
      expect.any(Error),
      reportContext,
    );
  });
});
