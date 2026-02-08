// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/src/application/test-helpers/render-hook';
import { usePracticeSessionSummaryReview } from './use-practice-session-summary-review';

describe('usePracticeSessionSummaryReview', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns idle state with null review when no summary exists', () => {
    const output = renderHook(() =>
      usePracticeSessionSummaryReview({
        summary: null,
        sessionId: 'session-1',
        isMounted: () => true,
      }),
    );

    expect(output.summaryReview).toBeNull();
    expect(output.summaryReviewLoadState).toEqual({ status: 'idle' });
  });
});
