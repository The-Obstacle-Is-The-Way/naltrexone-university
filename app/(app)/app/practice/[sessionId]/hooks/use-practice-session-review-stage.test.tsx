// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type {
  EndPracticeSessionOutput,
  GetPracticeSessionReviewOutput,
} from '@/src/adapters/controllers/practice-controller';
import { renderHook } from '@/src/application/test-helpers/render-hook';
import { usePracticeSessionReviewStage } from './use-practice-session-review-stage';

describe('usePracticeSessionReviewStage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
        resetQuestionState: () => undefined,
        loadSpecificQuestion: () => undefined,
        endPracticeSessionFn: async (): Promise<
          ActionResult<EndPracticeSessionOutput>
        > => {
          throw new Error('not used');
        },
        getPracticeSessionReviewFn: async (): Promise<
          ActionResult<GetPracticeSessionReviewOutput>
        > => {
          throw new Error('not used');
        },
        getPracticeSessionSummaryFn: async (): Promise<
          ActionResult<EndPracticeSessionOutput>
        > => {
          throw new Error('not used');
        },
      }),
    );

    expect(output.summary).toBeNull();
    expect(typeof output.setSummary).toBe('function');
    expect(output.summaryReview).toBeNull();
    expect(output.summaryReviewLoadState).toEqual({ status: 'idle' });
    expect(output.review).toBeNull();
    expect(typeof output.setReview).toBe('function');
    expect(output.reviewLoadState).toEqual({ status: 'idle' });
    expect(output.navigator).toBeNull();
    expect(output.navigatorLoadState).toEqual({ status: 'idle' });
    expect(output.isInReviewStage).toBe(false);
    expect(typeof output.onEndSession).toBe('function');
    expect(typeof output.onOpenReviewQuestion).toBe('function');
    expect(typeof output.onFinalizeReview).toBe('function');
    expect(typeof output.onRetryNavigator).toBe('function');
    expect(typeof output.onRetryReview).toBe('function');
  });
});
