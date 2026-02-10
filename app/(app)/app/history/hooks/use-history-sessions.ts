'use client';

import { useCallback, useRef, useState } from 'react';
import {
  getActionResultErrorMessage,
  getThrownErrorMessage,
} from '@/app/(app)/app/practice/practice-logic';
import type { AsyncLoadStateWithIdle } from '@/app/(app)/app/shared/load-state';
import { useIsMounted } from '@/lib/use-is-mounted';
import {
  type GetPracticeSessionReviewOutput,
  getPracticeSessionReview,
} from '@/src/adapters/controllers/practice-controller';

export type UseHistorySessionsOutput = {
  selectedSessionId: string | null;
  selectedReview: GetPracticeSessionReviewOutput | null;
  reviewLoadState: AsyncLoadStateWithIdle;
  onOpenSession: (sessionId: string) => Promise<void>;
};

export function useHistorySessions(): UseHistorySessionsOutput {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [selectedReview, setSelectedReview] =
    useState<GetPracticeSessionReviewOutput | null>(null);
  const [reviewLoadState, setReviewLoadState] =
    useState<AsyncLoadStateWithIdle>({ status: 'idle' });
  const latestReviewSessionId = useRef<string | null>(null);
  const isMounted = useIsMounted();

  const onOpenSession = useCallback(
    async (sessionId: string) => {
      if (selectedSessionId === sessionId) {
        latestReviewSessionId.current = null;
        setSelectedSessionId(null);
        setSelectedReview(null);
        setReviewLoadState({ status: 'idle' });
        return;
      }

      latestReviewSessionId.current = sessionId;
      setSelectedSessionId(sessionId);
      setSelectedReview(null);
      setReviewLoadState({ status: 'loading' });

      let res: Awaited<ReturnType<typeof getPracticeSessionReview>>;
      try {
        res = await getPracticeSessionReview({ sessionId });
      } catch (error) {
        if (!isMounted()) return;
        if (latestReviewSessionId.current !== sessionId) return;
        setReviewLoadState({
          status: 'error',
          message: getThrownErrorMessage(error),
        });
        return;
      }
      if (!isMounted()) return;
      if (latestReviewSessionId.current !== sessionId) return;

      if (!res.ok) {
        setReviewLoadState({
          status: 'error',
          message: getActionResultErrorMessage(res),
        });
        return;
      }

      setSelectedReview(res.data);
      setReviewLoadState({ status: 'ready' });
    },
    [isMounted, selectedSessionId],
  );

  return {
    selectedSessionId,
    selectedReview,
    reviewLoadState,
    onOpenSession,
  };
}
