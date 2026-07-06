import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import * as reportClientError from '@/lib/report-client-error';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { GetPracticeSessionReviewOutput } from '@/src/adapters/controllers/practice-controller';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';
import { installReportClientErrorMocks } from '@/tests/test-helpers/report-client-error-mocks';

import {
  type UsePracticeSessionReviewStageStateInput,
  usePracticeSessionReviewStageState,
} from './use-practice-session-review-stage-state';

const fixtureSession1Id = crypto.randomUUID();
const fixtureQ1Id = crypto.randomUUID();

const getPracticeSessionReviewMock =
  vi.fn<
    (input: unknown) => Promise<ActionResult<GetPracticeSessionReviewOutput>>
  >();

vi.mock('@/lib/report-client-error', { spy: true });

const reportClientErrorSpy = vi.mocked(reportClientError.reportClientError);

installReportClientErrorMocks(reportClientError);

type ReviewLoadResult = {
  ok: true;
  data: GetPracticeSessionReviewOutput;
};

function createInput(
  sessionMode: 'tutor' | 'exam' | null,
): UsePracticeSessionReviewStageStateInput {
  return {
    sessionId: fixtureSession1Id,
    isMounted: () => true,
    sessionMode,
    setSessionMode: vi.fn(),
    resetQuestionState: vi.fn(),
    loadSpecificQuestion: vi.fn(),
    finalizeSession: vi.fn().mockResolvedValue(undefined),
    getPracticeSessionReviewFn: getPracticeSessionReviewMock,
  };
}

describe('usePracticeSessionReviewStageState (browser)', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('finalizes tutor sessions without attempting to load exam review', async () => {
    const input = createInput('tutor');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStageState(input),
    );

    harness.result.current.onEndSession();

    await expect
      .poll(() => vi.mocked(input.finalizeSession).mock.calls.length)
      .toBe(1);
    expect(getPracticeSessionReviewMock).not.toHaveBeenCalled();
  });

  it('loads exam review data when ending an exam session', async () => {
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 2,
        answeredCount: 1,
        markedCount: 0,
        rows: [],
      }),
    );

    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStageState(input),
    );

    harness.result.current.onEndSession();

    await expect
      .poll(() => harness.result.current.reviewLoadState.status)
      .toBe('ready');
    expect(harness.result.current.review?.sessionId).toBe(fixtureSession1Id);
    expect(harness.result.current.isInReviewStage).toBe(true);
    expect(vi.mocked(input.setSessionMode)).toHaveBeenCalledWith('exam');
    expect(vi.mocked(input.resetQuestionState)).toHaveBeenCalledTimes(1);
  });

  it('finalizes the session when review data reports a non-exam mode', async () => {
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        mode: 'tutor',
        totalCount: 1,
        answeredCount: 1,
        markedCount: 0,
        rows: [],
      }),
    );

    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStageState(input),
    );

    harness.result.current.onEndSession();

    await expect
      .poll(() => vi.mocked(input.finalizeSession).mock.calls.length)
      .toBe(1);
    await expect
      .poll(() => harness.result.current.reviewLoadState.status)
      .toBe('idle');
    await expect.poll(() => harness.result.current.isInReviewStage).toBe(false);
    expect(vi.mocked(input.setSessionMode)).toHaveBeenCalledWith('tutor');
  });

  it('sets an error state when finalizeSession rejects after loading non-exam review data', async () => {
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        mode: 'tutor',
        totalCount: 1,
        answeredCount: 1,
        markedCount: 0,
        rows: [],
      }),
    );

    const input = createInput('exam');
    const error = new Error('Finalize failed');
    vi.mocked(input.finalizeSession).mockRejectedValue(error);
    const harness = await renderHook(() =>
      usePracticeSessionReviewStageState(input),
    );

    harness.result.current.onEndSession();

    await expect
      .poll(() => harness.result.current.reviewLoadState.status)
      .toBe('error');
    expect(harness.result.current.reviewLoadState).toEqual({
      status: 'error',
      message: 'Finalize failed',
    });
    expect(reportClientErrorSpy).toHaveBeenCalledWith(error, {
      component: 'UsePracticeSessionReviewStageState',
      action: 'finalizeSession',
    });
  });

  it('runs only one review-load operation when ending and retrying rapidly', async () => {
    getPracticeSessionReviewMock.mockClear();
    const deferred = createDeferred<ReviewLoadResult>();
    getPracticeSessionReviewMock.mockReturnValue(deferred.promise);

    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStageState(input),
    );

    harness.result.current.onEndSession();
    harness.result.current.onRetryReview();

    expect(getPracticeSessionReviewMock).toHaveBeenCalledTimes(1);

    deferred.resolve(
      ok({
        sessionId: fixtureSession1Id,
        mode: 'tutor',
        totalCount: 1,
        answeredCount: 1,
        markedCount: 0,
        rows: [],
      }),
    );

    await expect
      .poll(() => vi.mocked(input.finalizeSession).mock.calls.length)
      .toBe(1);
  });

  it('sets an error state when review loading throws', async () => {
    const error = new Error('Review load failed');
    getPracticeSessionReviewMock.mockRejectedValue(error);

    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStageState(input),
    );

    harness.result.current.onEndSession();

    await expect
      .poll(() => harness.result.current.reviewLoadState.status)
      .toBe('error');
    expect(harness.result.current.reviewLoadState).toEqual({
      status: 'error',
      message: 'Review load failed',
    });
    expect(reportClientErrorSpy).toHaveBeenCalledWith(error, {
      component: 'UsePracticeSessionReviewStageState',
      action: 'loadReview',
    });
  });

  it('sets an error state when the controller returns an error ActionResult', async () => {
    getPracticeSessionReviewMock.mockResolvedValue({
      ok: false,
      error: { code: 'CONFLICT', message: 'Review not available' },
    });

    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStageState(input),
    );

    harness.result.current.onEndSession();

    await expect
      .poll(() => harness.result.current.reviewLoadState.status)
      .toBe('error');
    expect(harness.result.current.reviewLoadState).toEqual({
      status: 'error',
      message: 'Review not available',
    });
  });

  it('opens a specific review question and exits review stage', async () => {
    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStageState(input),
    );

    harness.result.current.onOpenReviewQuestion(fixtureQ1Id);

    await expect.poll(() => harness.result.current.isInReviewStage).toBe(false);
    expect(vi.mocked(input.loadSpecificQuestion)).toHaveBeenCalledWith(
      fixtureQ1Id,
    );
  });

  it('finalizes review state when requested', async () => {
    const input = createInput('exam');
    vi.mocked(input.finalizeSession).mockResolvedValue(true);
    const harness = await renderHook(() =>
      usePracticeSessionReviewStageState(input),
    );

    const finalized = await harness.result.current.onFinalizeReview();
    expect(finalized).toBe(true);

    await expect
      .poll(() => vi.mocked(input.finalizeSession).mock.calls.length)
      .toBe(1);
    await expect.poll(() => harness.result.current.isInReviewStage).toBe(false);
  });
});
