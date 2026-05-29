// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/src/application/test-helpers/render-hook';
import { usePracticeSessionSummaryReview } from './use-practice-session-summary-review';

const { fixtureSession1Id } = vi.hoisted(() => ({
  fixtureSession1Id: crypto.randomUUID(),
}));

describe('usePracticeSessionSummaryReview', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns idle state with null review when no summary exists', () => {
    const output = renderHook(() =>
      usePracticeSessionSummaryReview({
        summary: null,
        sessionId: fixtureSession1Id,
        isMounted: () => true,
        getPracticeSessionReviewFn: vi.fn(),
      }),
    );

    expect(output.summaryReview).toBeNull();
    expect(output.summaryReviewLoadState).toEqual({ status: 'idle' });
  });
});
