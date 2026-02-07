// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { usePracticeSessionPageController } from './use-practice-session-page-controller';

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

describe('usePracticeSessionPageController', () => {
  it('returns the expected initial state contract', () => {
    const output = renderHook(() =>
      usePracticeSessionPageController('session-1'),
    );

    expect(output.sessionInfo).toBeNull();
    expect(output.loadState).toEqual({ status: 'idle' });
    expect(output.question).toBeNull();
    expect(output.selectedChoiceId).toBeNull();
    expect(output.submitResult).toBeNull();
    expect(output.bookmarkStatus).toBe('idle');
    expect(output.isBookmarked).toBe(false);
    expect(output.isMarkingForReview).toBe(false);
    expect(output.bookmarkMessage).toBeNull();
    expect(output.canSubmit).toBe(false);
    expect(output.summary).toBeNull();
    expect(output.summaryReview).toBeNull();
    expect(output.summaryReviewLoadState).toEqual({ status: 'idle' });
    expect(output.review).toBeNull();
    expect(output.reviewLoadState).toEqual({ status: 'idle' });
    expect(output.navigator).toBeNull();
    expect(typeof output.onEndSession).toBe('function');
    expect(typeof output.onTryAgain).toBe('function');
    expect(typeof output.onToggleBookmark).toBe('function');
    expect(typeof output.onToggleMarkForReview).toBe('function');
    expect(typeof output.onSelectChoice).toBe('function');
    expect(typeof output.onSubmit).toBe('function');
    expect(typeof output.onNextQuestion).toBe('function');
    expect(typeof output.onNavigateQuestion).toBe('function');
    expect(typeof output.onOpenReviewQuestion).toBe('function');
    expect(typeof output.onFinalizeReview).toBe('function');
  });
});
