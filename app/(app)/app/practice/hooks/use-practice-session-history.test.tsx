// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { usePracticeSessionHistory } from './use-practice-session-history';

function renderHook<T>(useHook: () => T): T {
  let captured: T | null = null;

  function Probe() {
    captured = useHook();
    return null;
  }

  renderToStaticMarkup(<Probe />);
  if (captured === null) {
    throw new Error('Hook result was not captured');
  }
  return captured;
}

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
