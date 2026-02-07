// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { usePracticeSessionControls } from './use-practice-session-controls';

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

describe('usePracticeSessionControls', () => {
  it('returns the expected initial state contract', () => {
    const output = renderHook(() => usePracticeSessionControls());

    expect(output.filters).toEqual({
      tagSlugs: [],
      difficulties: [],
    });
    expect(output.sessionMode).toBe('tutor');
    expect(output.sessionCount).toBe(20);
    expect(output.tagLoadStatus).toBe('loading');
    expect(output.availableTags).toEqual([]);
    expect(output.sessionStartStatus).toBe('idle');
    expect(output.sessionStartError).toBeNull();
    expect(output.incompleteSessionStatus).toBe('loading');
    expect(output.incompleteSessionError).toBeNull();
    expect(output.incompleteSession).toBeNull();
    expect(output.sessionHistoryStatus).toBe('loading');
    expect(output.sessionHistoryRows).toEqual([]);
    expect(output.selectedHistorySessionId).toBeNull();
    expect(output.selectedHistoryReview).toBeNull();
    expect(output.historyReviewLoadState).toEqual({ status: 'idle' });
    expect(typeof output.onSessionModeChange).toBe('function');
    expect(typeof output.onSessionCountChange).toBe('function');
    expect(typeof output.onToggleTag).toBe('function');
    expect(typeof output.onToggleDifficulty).toBe('function');
    expect(typeof output.onStartSession).toBe('function');
    expect(typeof output.onAbandonIncompleteSession).toBe('function');
    expect(typeof output.onOpenSessionHistory).toBe('function');
  });
});
