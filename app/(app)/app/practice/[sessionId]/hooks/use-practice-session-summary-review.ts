import { useEffect, useState } from 'react';
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
        if (!mounted || !input.isMounted()) return;
        setSummaryReviewLoadState({
          status: 'error',
          message: getThrownErrorMessage(error),
        });
        return;
      }
      if (!mounted || !input.isMounted()) return;
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
  }, [input.summary, input.sessionId, input.isMounted]);

  return {
    summaryReview,
    summaryReviewLoadState,
  };
}
