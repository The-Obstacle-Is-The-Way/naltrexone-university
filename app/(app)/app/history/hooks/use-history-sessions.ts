'use client';

import { useCallback, useRef, useState } from 'react';
import {
  getActionResultErrorMessage,
  getThrownErrorMessage,
} from '@/app/(app)/app/practice/practice-logic';
import type { AsyncLoadStateWithIdle } from '@/app/(app)/app/shared/load-state';
import { useIsMounted } from '@/lib/use-is-mounted';
import { withTimeout } from '@/lib/with-timeout';
import {
  type GetPracticeSessionReviewOutput,
  getPracticeSessionReview,
} from '@/src/adapters/controllers/practice-controller';

const SESSION_REVIEW_TIMEOUT_MS = 10_000;

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
  const selectedSessionIdRef = useRef<string | null>(null);
  const latestRequestId = useRef(0);
  const isMounted = useIsMounted();

  const onOpenSession = useCallback(
    async (sessionId: string) => {
      if (selectedSessionIdRef.current === sessionId) {
        selectedSessionIdRef.current = null;
        latestRequestId.current += 1;
        setSelectedSessionId(null);
        setSelectedReview(null);
        setReviewLoadState({ status: 'idle' });
        return;
      }

      selectedSessionIdRef.current = sessionId;
      latestRequestId.current += 1;
      const requestId = latestRequestId.current;
      setSelectedSessionId(sessionId);
      setSelectedReview(null);
      setReviewLoadState({ status: 'loading' });

      let res: Awaited<ReturnType<typeof getPracticeSessionReview>>;
      try {
        res = await withTimeout(
          getPracticeSessionReview({ sessionId }),
          SESSION_REVIEW_TIMEOUT_MS,
        );
      } catch (error) {
        if (!isMounted()) return;
        if (latestRequestId.current !== requestId) return;
        setReviewLoadState({
          status: 'error',
          message: getThrownErrorMessage(error),
        });
        return;
      }
      if (!isMounted()) return;
      if (latestRequestId.current !== requestId) return;

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
    [isMounted],
  );

  return {
    selectedSessionId,
    selectedReview,
    reviewLoadState,
    onOpenSession,
  };
}
