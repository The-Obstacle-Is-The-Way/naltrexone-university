import { useEffect, useRef, useState } from 'react';
import type { LoadState } from '@/app/(app)/app/practice/practice-page-logic';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type {
  EndPracticeSessionOutput,
  GetPracticeSessionReviewOutput,
} from '@/src/adapters/controllers/practice-controller';
import { createSummaryReviewEffect } from '../practice-session-page-logic';

export type UsePracticeSessionSummaryReviewInput = {
  summary: EndPracticeSessionOutput | null;
  sessionId: string;
  isMounted: () => boolean;
  getPracticeSessionReviewFn: (
    input: unknown,
  ) => Promise<ActionResult<GetPracticeSessionReviewOutput>>;
};

export type UsePracticeSessionSummaryReviewOutput = {
  summaryReview: GetPracticeSessionReviewOutput | null;
  summaryReviewLoadState: LoadState;
};

export function usePracticeSessionSummaryReview(
  input: UsePracticeSessionSummaryReviewInput,
): UsePracticeSessionSummaryReviewOutput {
  const isMountedRef = useRef(input.isMounted);
  isMountedRef.current = input.isMounted;

  const [summaryReview, setSummaryReview] =
    useState<GetPracticeSessionReviewOutput | null>(null);
  const [summaryReviewLoadState, setSummaryReviewLoadState] =
    useState<LoadState>({
      status: 'idle',
    });

  useEffect(() => {
    return createSummaryReviewEffect({
      summary: input.summary,
      sessionId: input.sessionId,
      getPracticeSessionReviewFn: input.getPracticeSessionReviewFn,
      setSummaryReview,
      setSummaryReviewLoadState,
      isMounted: () => isMountedRef.current(),
    });
  }, [input.summary, input.sessionId, input.getPracticeSessionReviewFn]);

  return {
    summaryReview,
    summaryReviewLoadState,
  };
}
