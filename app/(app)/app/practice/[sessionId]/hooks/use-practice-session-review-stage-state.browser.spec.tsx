import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { ok } from '@/tests/test-helpers/ok';
import {
  type UsePracticeSessionReviewStageStateInput,
  usePracticeSessionReviewStageState,
} from './use-practice-session-review-stage-state';

const { getPracticeSessionReviewMock } = vi.hoisted(() => ({
  getPracticeSessionReviewMock: vi.fn(),
}));

vi.mock('@/src/adapters/controllers/practice-controller', () => ({
  getPracticeSessionReview: getPracticeSessionReviewMock,
}));

function createInput(
  sessionMode: 'tutor' | 'exam' | null,
): UsePracticeSessionReviewStageStateInput {
  return {
    sessionId: 'session-1',
    isMounted: () => true,
    sessionMode,
    setSessionMode: vi.fn(),
    resetQuestionState: vi.fn(),
    loadSpecificQuestion: vi.fn(),
    finalizeSession: vi.fn().mockResolvedValue(undefined),
  };
}

describe('usePracticeSessionReviewStageState (browser)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
        sessionId: 'session-1',
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
    expect(harness.result.current.review?.sessionId).toBe('session-1');
    expect(harness.result.current.isInReviewStage).toBe(true);
    expect(vi.mocked(input.setSessionMode)).toHaveBeenCalledWith('exam');
    expect(vi.mocked(input.resetQuestionState)).toHaveBeenCalledTimes(1);
  });

  it('finalizes the session when review data reports a non-exam mode', async () => {
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: 'session-1',
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

  it('sets an error state when review loading throws', async () => {
    getPracticeSessionReviewMock.mockRejectedValue(
      new Error('Review load failed'),
    );

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
  });

  it('sets an error state when the controller returns an error ActionResult', async () => {
    getPracticeSessionReviewMock.mockResolvedValue({
      ok: false,
      error: { code: 'TEST_ERROR', message: 'Review not available' },
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

  it('opens a specific review question', async () => {
    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStageState(input),
    );

    harness.result.current.onOpenReviewQuestion('q1');

    await expect.poll(() => harness.result.current.isInReviewStage).toBe(true);
    expect(vi.mocked(input.loadSpecificQuestion)).toHaveBeenCalledWith('q1');
  });

  it('finalizes review state when requested', async () => {
    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStageState(input),
    );

    harness.result.current.onFinalizeReview();

    await expect
      .poll(() => vi.mocked(input.finalizeSession).mock.calls.length)
      .toBe(1);
    await expect.poll(() => harness.result.current.isInReviewStage).toBe(false);
  });
});
