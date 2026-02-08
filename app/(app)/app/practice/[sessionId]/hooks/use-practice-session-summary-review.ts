import { useEffect, useRef, useState } from 'react';
import {
  getActionResultErrorMessage,
  getThrownErrorMessage,
} from '@/app/(app)/app/practice/practice-logic';
import type { LoadState } from '@/app/(app)/app/practice/practice-page-logic';
import {
  type EndPracticeSessionOutput,
  type GetPracticeSessionReviewOutput,
  getPracticeSessionReview,
} from '@/src/adapters/controllers/practice-controller';

export type UsePracticeSessionSummaryReviewInput = {
  summary: EndPracticeSessionOutput | null;
  sessionId: string;
  isMounted: () => boolean;
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
    if (!input.summary) {
      setSummaryReview(null);
      setSummaryReviewLoadState({ status: 'idle' });
      return;
    }

    let mounted = true;
    setSummaryReview(null);
    setSummaryReviewLoadState({ status: 'loading' });

    void (async () => {
      let res: Awaited<ReturnType<typeof getPracticeSessionReview>>;
      try {
        res = await getPracticeSessionReview({ sessionId: input.sessionId });
      } catch (error) {
        if (!mounted || !isMountedRef.current()) return;
        setSummaryReviewLoadState({
          status: 'error',
          message: getThrownErrorMessage(error),
        });
        return;
      }
      if (!mounted || !isMountedRef.current()) return;
      if (!res.ok) {
        setSummaryReviewLoadState({
          status: 'error',
          message: getActionResultErrorMessage(res),
        });
        return;
      }

      setSummaryReview(res.data);
      setSummaryReviewLoadState({ status: 'ready' });
    })();

    return () => {
      mounted = false;
    };
  }, [input.summary, input.sessionId]);

  return {
    summaryReview,
    summaryReviewLoadState,
  };
}
