import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { ok } from '@/tests/test-helpers/ok';
import { usePracticeSessionReviewStage } from './use-practice-session-review-stage';

const { endPracticeSessionMock, getPracticeSessionReviewMock } = vi.hoisted(
  () => ({
    endPracticeSessionMock: vi.fn(),
    getPracticeSessionReviewMock: vi.fn(),
  }),
);

vi.mock('@/src/adapters/controllers/practice-controller', () => ({
  endPracticeSession: endPracticeSessionMock,
  getPracticeSessionReview: getPracticeSessionReviewMock,
}));

function createInput(sessionMode: 'tutor' | 'exam') {
  return {
    sessionId: 'session-1',
    isMounted: () => true,
    sessionInfo: null,
    questionId: null,
    submitResult: null,
    sessionMode,
    setSessionMode: vi.fn(),
    setLoadState: vi.fn(),
    setQuestion: vi.fn(),
    setSubmitResult: vi.fn(),
    setSelectedChoiceId: vi.fn(),
    loadSpecificQuestion: vi.fn(),
  };
}

describe('usePracticeSessionReviewStage (browser)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('finalizes tutor sessions and loads summary review data', async () => {
    endPracticeSessionMock.mockResolvedValue(
      ok({
        sessionId: 'session-1',
        endedAt: '2026-02-07T00:20:00.000Z',
        totals: {
          answered: 10,
          correct: 8,
          accuracy: 0.8,
          durationSeconds: 1200,
        },
      }),
    );
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: 'session-1',
        mode: 'tutor',
        totalCount: 10,
        answeredCount: 10,
        markedCount: 0,
        rows: [],
      }),
    );

    const input = createInput('tutor');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
    );

    harness.result.current.onEndSession();

    await expect
      .poll(() => harness.result.current.summary?.sessionId ?? null)
      .toBe('session-1');
    await expect
      .poll(() => harness.result.current.summaryReviewLoadState.status)
      .toBe('ready');
    expect(harness.result.current.summaryReview?.sessionId).toBe('session-1');
  });

  it('sets review load error when exam review loading throws', async () => {
    getPracticeSessionReviewMock.mockRejectedValue(
      new Error('Review load failed'),
    );

    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
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
});
