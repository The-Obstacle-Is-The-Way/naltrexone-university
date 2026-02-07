import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsMounted } from '@/lib/use-is-mounted';
import {
  type GetPracticeSessionReviewOutput,
  type GetSessionHistoryOutput,
  getPracticeSessionReview,
  getSessionHistory,
} from '@/src/adapters/controllers/practice-controller';
import {
  getActionResultErrorMessage,
  getThrownErrorMessage,
} from '../practice-logic';
import type { LoadState } from '../practice-page-logic';

export type UsePracticeSessionHistoryOutput = {
  sessionHistoryStatus: 'idle' | 'loading' | 'error';
  sessionHistoryError: string | null;
  sessionHistoryRows: GetSessionHistoryOutput['rows'];
  selectedHistorySessionId: string | null;
  selectedHistoryReview: GetPracticeSessionReviewOutput | null;
  historyReviewLoadState: LoadState;
  onOpenSessionHistory: (sessionId: string) => Promise<void>;
};

export function usePracticeSessionHistory(): UsePracticeSessionHistoryOutput {
  const [sessionHistoryStatus, setSessionHistoryStatus] = useState<
    'idle' | 'loading' | 'error'
  >('loading');
  const [sessionHistoryError, setSessionHistoryError] = useState<string | null>(
    null,
  );
  const [sessionHistoryRows, setSessionHistoryRows] = useState<
    GetSessionHistoryOutput['rows']
  >([]);
  const [selectedHistorySessionId, setSelectedHistorySessionId] = useState<
    string | null
  >(null);
  const [selectedHistoryReview, setSelectedHistoryReview] =
    useState<GetPracticeSessionReviewOutput | null>(null);
  const [historyReviewLoadState, setHistoryReviewLoadState] =
    useState<LoadState>({
      status: 'idle',
    });
  const latestReviewSessionId = useRef<string | null>(null);
  const isMounted = useIsMounted();

  useEffect(() => {
    let mounted = true;
    setSessionHistoryStatus('loading');
    setSessionHistoryError(null);

    void (async () => {
      let res: Awaited<ReturnType<typeof getSessionHistory>>;
      try {
        res = await getSessionHistory({ limit: 10, offset: 0 });
      } catch (error) {
        if (!mounted) return;
        setSessionHistoryStatus('error');
        setSessionHistoryError(getThrownErrorMessage(error));
        return;
      }
      if (!mounted) return;

      if (!res.ok) {
        setSessionHistoryStatus('error');
        setSessionHistoryError(getActionResultErrorMessage(res));
        return;
      }

      setSessionHistoryRows(res.data.rows);
      setSessionHistoryStatus('idle');
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const onOpenSessionHistory = useCallback(
    async (sessionId: string) => {
      latestReviewSessionId.current = sessionId;
      setSelectedHistorySessionId(sessionId);
      setSelectedHistoryReview(null);
      setHistoryReviewLoadState({ status: 'loading' });

      let res: Awaited<ReturnType<typeof getPracticeSessionReview>>;
      try {
        res = await getPracticeSessionReview({ sessionId });
      } catch (error) {
        if (!isMounted()) return;
        if (latestReviewSessionId.current !== sessionId) return;
        setHistoryReviewLoadState({
          status: 'error',
          message: getThrownErrorMessage(error),
        });
        return;
      }
      if (!isMounted()) return;
      if (latestReviewSessionId.current !== sessionId) return;

      if (!res.ok) {
        setHistoryReviewLoadState({
          status: 'error',
          message: getActionResultErrorMessage(res),
        });
        return;
      }

      setSelectedHistoryReview(res.data);
      setHistoryReviewLoadState({ status: 'ready' });
    },
    [isMounted],
  );

  return {
    sessionHistoryStatus,
    sessionHistoryError,
    sessionHistoryRows,
    selectedHistorySessionId,
    selectedHistoryReview,
    historyReviewLoadState,
    onOpenSessionHistory,
  };
}
