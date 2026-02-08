import { useCallback, useEffect, useState } from 'react';
import {
  endPracticeSession,
  type GetIncompletePracticeSessionOutput,
  getIncompletePracticeSession,
} from '@/src/adapters/controllers/practice-controller';
import {
  getActionResultErrorMessage,
  getThrownErrorMessage,
} from '../practice-logic';

type IncompletePracticeSession =
  NonNullable<GetIncompletePracticeSessionOutput>;

export type UsePracticeIncompleteSessionInput = {
  isMounted: () => boolean;
};

export type UsePracticeIncompleteSessionOutput = {
  incompleteSessionStatus: 'idle' | 'loading' | 'error';
  incompleteSessionError: string | null;
  incompleteSession: IncompletePracticeSession | null;
  onAbandonIncompleteSession: () => Promise<void>;
};

export function usePracticeIncompleteSession(
  input: UsePracticeIncompleteSessionInput,
): UsePracticeIncompleteSessionOutput {
  const [incompleteSessionStatus, setIncompleteSessionStatus] = useState<
    'idle' | 'loading' | 'error'
  >('loading');
  const [incompleteSessionError, setIncompleteSessionError] = useState<
    string | null
  >(null);
  const [incompleteSession, setIncompleteSession] =
    useState<IncompletePracticeSession | null>(null);

  useEffect(() => {
    let mounted = true;
    setIncompleteSessionStatus('loading');
    setIncompleteSessionError(null);

    void (async () => {
      let res: Awaited<ReturnType<typeof getIncompletePracticeSession>>;
      try {
        res = await getIncompletePracticeSession({});
      } catch (error) {
        if (!mounted) return;
        setIncompleteSessionStatus('error');
        setIncompleteSessionError(getThrownErrorMessage(error));
        return;
      }
      if (!mounted) return;

      if (!res.ok) {
        setIncompleteSessionStatus('error');
        setIncompleteSessionError(getActionResultErrorMessage(res));
        return;
      }

      setIncompleteSession(res.data);
      setIncompleteSessionStatus('idle');
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const onAbandonIncompleteSession = useCallback(async () => {
    if (!incompleteSession) return;

    setIncompleteSessionStatus('loading');
    setIncompleteSessionError(null);

    let res: Awaited<ReturnType<typeof endPracticeSession>>;
    try {
      res = await endPracticeSession({
        sessionId: incompleteSession.sessionId,
      });
    } catch (error) {
      if (!input.isMounted()) return;
      setIncompleteSessionStatus('error');
      setIncompleteSessionError(getThrownErrorMessage(error));
      return;
    }
    if (!input.isMounted()) return;

    if (!res.ok) {
      setIncompleteSessionStatus('error');
      setIncompleteSessionError(getActionResultErrorMessage(res));
      return;
    }

    setIncompleteSession(null);
    setIncompleteSessionStatus('idle');
  }, [incompleteSession, input.isMounted]);

  return {
    incompleteSessionStatus,
    incompleteSessionError,
    incompleteSession,
    onAbandonIncompleteSession,
  };
}
