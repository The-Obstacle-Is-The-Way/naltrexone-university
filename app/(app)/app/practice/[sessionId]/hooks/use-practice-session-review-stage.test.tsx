// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/src/application/test-helpers/render-hook';
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
});
