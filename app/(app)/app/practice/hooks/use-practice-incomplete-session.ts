import { useCallback, useEffect, useState } from 'react';
import {
  discardPracticeSession,
  endPracticeSession,
  type GetIncompletePracticeSessionOutput,
  getIncompletePracticeSession,
} from '@/src/adapters/controllers/practice-controller';
import {
  abandonIncompleteSession,
  createIncompleteSessionEffect,
  createIncompleteSessionLoadGuard,
  loadIncompleteSession,
} from '../practice-page-incomplete-session';

type IncompletePracticeSession =
  NonNullable<GetIncompletePracticeSessionOutput>;

export type UsePracticeIncompleteSessionInput = {
  isMounted: () => boolean;
};

export type UsePracticeIncompleteSessionOutput = {
  incompleteSessionStatus: 'idle' | 'loading' | 'error';
  incompleteSessionError: string | null;
  incompleteSession: IncompletePracticeSession | null;
  refreshIncompleteSession: () => Promise<void>;
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
  const [abandonIdempotencyKey, setAbandonIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [incompleteSessionLoadGuard] = useState(
    createIncompleteSessionLoadGuard,
  );

  useEffect(() => {
    return createIncompleteSessionEffect({
      getIncompletePracticeSessionFn: getIncompletePracticeSession,
      setIncompleteSessionStatus,
      setIncompleteSessionError,
      setIncompleteSession,
      loadGuard: incompleteSessionLoadGuard,
    });
  }, [incompleteSessionLoadGuard]);

  const refreshIncompleteSession = useCallback(
    () =>
      loadIncompleteSession({
        getIncompletePracticeSessionFn: getIncompletePracticeSession,
        setIncompleteSessionStatus,
        setIncompleteSessionError,
        setIncompleteSession,
        isActive: input.isMounted,
        loadGuard: incompleteSessionLoadGuard,
      }),
    [incompleteSessionLoadGuard, input.isMounted],
  );

  const onAbandonIncompleteSession = useCallback(async () => {
    if (!incompleteSession) return;

    await abandonIncompleteSession({
      sessionId: incompleteSession.sessionId,
      idempotencyKey: abandonIdempotencyKey,
      rotateIdempotencyKey: () => setAbandonIdempotencyKey(crypto.randomUUID()),
      mode: incompleteSession.mode,
      endPracticeSessionFn: endPracticeSession,
      discardPracticeSessionFn: discardPracticeSession,
      setIncompleteSessionStatus,
      setIncompleteSessionError,
      setIncompleteSession,
      isMounted: input.isMounted,
    });
  }, [abandonIdempotencyKey, incompleteSession, input.isMounted]);

  return {
    incompleteSessionStatus,
    incompleteSessionError,
    incompleteSession,
    refreshIncompleteSession,
    onAbandonIncompleteSession,
  };
}
