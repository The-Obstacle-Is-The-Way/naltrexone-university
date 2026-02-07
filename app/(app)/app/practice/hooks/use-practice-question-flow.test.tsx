// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { usePracticeQuestionFlow } from './use-practice-question-flow';

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

describe('usePracticeQuestionFlow', () => {
  it('returns the expected initial state contract', () => {
    const output = renderHook(() =>
      usePracticeQuestionFlow({
        filters: { tagSlugs: [], difficulties: [] },
      }),
    );

    expect(output.question).toBeNull();
    expect(output.selectedChoiceId).toBeNull();
    expect(output.submitResult).toBeNull();
    expect(output.loadState).toEqual({ status: 'idle' });
    expect(output.bookmarkStatus).toBe('idle');
    expect(output.bookmarkMessage).toBeNull();
    expect(output.canSubmit).toBe(false);
    expect(output.isBookmarked).toBe(false);
    expect(typeof output.onTryAgain).toBe('function');
    expect(typeof output.onToggleBookmark).toBe('function');
    expect(typeof output.onSelectChoice).toBe('function');
    expect(typeof output.onSubmit).toBe('function');
    expect(typeof output.onNextQuestion).toBe('function');
  });
});
