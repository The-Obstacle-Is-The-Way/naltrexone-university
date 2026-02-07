// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { usePracticeSessionReviewStage } from './use-practice-session-review-stage';

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

describe('usePracticeSessionReviewStage', () => {
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
    expect(output.reviewLoadState).toEqual({ status: 'idle' });
    expect(output.navigator).toBeNull();
    expect(output.isInReviewStage).toBe(false);
    expect(typeof output.onEndSession).toBe('function');
    expect(typeof output.onOpenReviewQuestion).toBe('function');
    expect(typeof output.onFinalizeReview).toBe('function');
  });
});
