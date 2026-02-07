// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { renderHook } from '@/src/application/test-helpers/render-hook';
import { usePracticeSessionHistory } from './use-practice-session-history';

describe('usePracticeSessionHistory', () => {
  it('returns the expected initial state contract', () => {
    const output = renderHook(() => usePracticeSessionHistory());

    expect(output.sessionHistoryStatus).toBe('loading');
    expect(output.sessionHistoryError).toBeNull();
    expect(output.sessionHistoryRows).toEqual([]);
    expect(output.selectedHistorySessionId).toBeNull();
    expect(output.selectedHistoryReview).toBeNull();
    expect(output.historyReviewLoadState).toEqual({ status: 'idle' });
    expect(typeof output.onOpenSessionHistory).toBe('function');
  });
});
