// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { usePracticeSessionMarkForReview } from './use-practice-session-mark-for-review';

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

describe('usePracticeSessionMarkForReview', () => {
  it('returns the expected initial state contract', async () => {
    const output = renderHook(() =>
      usePracticeSessionMarkForReview({
        question: null,
        sessionMode: null,
        sessionInfo: null,
        sessionId: 'session-1',
        setSessionInfo: () => undefined,
        setLoadState: () => undefined,
        setReview: () => undefined,
        isMounted: () => true,
      }),
    );

    expect(output.isMarkingForReview).toBe(false);
    expect(typeof output.onToggleMarkForReview).toBe('function');

    await expect(output.onToggleMarkForReview()).resolves.toBeUndefined();
  });
});
