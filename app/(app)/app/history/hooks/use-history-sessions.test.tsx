// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { renderHook } from '@/src/application/test-helpers/render-hook';
import { useHistorySessions } from './use-history-sessions';

describe('useHistorySessions', () => {
  it('returns the expected initial state contract', () => {
    const output = renderHook(() => useHistorySessions());

    expect(output.selectedSessionId).toBeNull();
    expect(output.selectedReview).toBeNull();
    expect(output.reviewLoadState).toEqual({ status: 'idle' });
    expect(typeof output.onOpenSession).toBe('function');
  });
});
