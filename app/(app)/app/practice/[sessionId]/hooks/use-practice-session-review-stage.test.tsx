// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@/src/adapters/controllers/action-result';
import * as practiceController from '@/src/adapters/controllers/practice-controller';
import { renderHook } from '@/src/application/test-helpers/render-hook';
import { renderLiveHook } from '@/src/application/test-helpers/render-live-hook';
import { usePracticeSessionReviewStage } from './use-practice-session-review-stage';

describe('usePracticeSessionReviewStage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the expected initial state contract', () => {
    const output = renderHook(() =>
      usePracticeSessionReviewStage({
        sessionId: 'session-1',
        isMounted: () => true,
        sessionInfo: null,
        questionId: null,
        submitResult: null,
        sessionMode: null,
        setSessionMode: () => undefined,
        setLoadState: () => undefined,
        setQuestion: () => undefined,
        setSubmitResult: () => undefined,
        setSelectedChoiceId: () => undefined,
        loadSpecificQuestion: () => undefined,
      }),
    );

    expect(output.summary).toBeNull();
    expect(output.summaryReview).toBeNull();
    expect(output.summaryReviewLoadState).toEqual({ status: 'idle' });
    expect(output.review).toBeNull();
    expect(typeof output.setReview).toBe('function');
    expect(output.reviewLoadState).toEqual({ status: 'idle' });
    expect(output.navigator).toBeNull();
    expect(output.isInReviewStage).toBe(false);
    expect(typeof output.onEndSession).toBe('function');
    expect(typeof output.onOpenReviewQuestion).toBe('function');
    expect(typeof output.onFinalizeReview).toBe('function');
  });

  it('finalizes tutor sessions and loads summary review data', async () => {
    vi.spyOn(practiceController, 'endPracticeSession').mockResolvedValue(
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
    vi.spyOn(practiceController, 'getPracticeSessionReview').mockResolvedValue(
      ok({
        sessionId: 'session-1',
        mode: 'tutor',
        totalCount: 10,
        answeredCount: 10,
        markedCount: 0,
        rows: [],
      }),
    );

    const harness = renderLiveHook(() =>
      usePracticeSessionReviewStage({
        sessionId: 'session-1',
        isMounted: () => true,
        sessionInfo: null,
        questionId: null,
        submitResult: null,
        sessionMode: 'tutor',
        setSessionMode: vi.fn(),
        setLoadState: vi.fn(),
        setQuestion: vi.fn(),
        setSubmitResult: vi.fn(),
        setSelectedChoiceId: vi.fn(),
        loadSpecificQuestion: vi.fn(),
      }),
    );

    try {
      await harness.waitFor(() => true);
      harness.getCurrent().onEndSession();
      await harness.waitFor(
        (output) => output.summary?.sessionId === 'session-1',
      );
      await harness.waitFor(
        (output) => output.summaryReviewLoadState.status === 'ready',
      );
      expect(harness.getCurrent().summaryReview?.sessionId).toBe('session-1');
    } finally {
      harness.unmount();
    }
  });

  it('sets review load error when exam review loading throws', async () => {
    vi.spyOn(practiceController, 'getPracticeSessionReview').mockRejectedValue(
      new Error('Review load failed'),
    );

    const harness = renderLiveHook(() =>
      usePracticeSessionReviewStage({
        sessionId: 'session-1',
        isMounted: () => true,
        sessionInfo: null,
        questionId: null,
        submitResult: null,
        sessionMode: 'exam',
        setSessionMode: vi.fn(),
        setLoadState: vi.fn(),
        setQuestion: vi.fn(),
        setSubmitResult: vi.fn(),
        setSelectedChoiceId: vi.fn(),
        loadSpecificQuestion: vi.fn(),
      }),
    );

    try {
      await harness.waitFor(() => true);
      harness.getCurrent().onEndSession();
      await harness.waitFor(
        (output) => output.reviewLoadState.status === 'error',
      );
      expect(harness.getCurrent().reviewLoadState).toEqual({
        status: 'error',
        message: 'Review load failed',
      });
    } finally {
      harness.unmount();
    }
  });
});
