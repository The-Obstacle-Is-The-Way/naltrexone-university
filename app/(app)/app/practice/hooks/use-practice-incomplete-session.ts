import { useCallback, useEffect, useRef, useState } from 'react';
import {
  discardPracticeSession,
  endPracticeSession,
  type GetIncompletePracticeSessionOutput,
  getIncompletePracticeSession,
} from '@/src/adapters/controllers/practice-controller';
import {
  type AbandonRequestToken,
  abandonIncompleteSession,
  createIncompleteSessionEffect,
  createIncompleteSessionLoadGuard,
  loadIncompleteSession,
  resolveAbandonRequestToken,
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
  onAbandonIncompleteSession: () => Promise<boolean>;
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
  // A ref, not state: the token drives no rendering, and resolving it
  // synchronously keeps a double-click on the same session reusing one key
  // (the second request lands on the first's in-progress claim).
  const abandonRequestTokenRef = useRef<AbandonRequestToken | null>(null);
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
    if (!incompleteSession) return false;

    // The token is bound to the session it targets: a preserved key may only
    // retry the same session's abandon, never carry a different session.
    const token = resolveAbandonRequestToken(
      abandonRequestTokenRef.current,
      incompleteSession.sessionId,
      () => crypto.randomUUID(),
    );
    abandonRequestTokenRef.current = token;

    return abandonIncompleteSession({
      sessionId: incompleteSession.sessionId,
      idempotencyKey: token.key,
      rotateIdempotencyKey: () => {
        abandonRequestTokenRef.current = {
          sessionId: token.sessionId,
          key: crypto.randomUUID(),
        };
      },
      mode: incompleteSession.mode,
      endPracticeSessionFn: endPracticeSession,
      discardPracticeSessionFn: discardPracticeSession,
      setIncompleteSessionStatus,
      setIncompleteSessionError,
      setIncompleteSession,
      isMounted: input.isMounted,
    });
  }, [incompleteSession, input.isMounted]);

  return {
    incompleteSessionStatus,
    incompleteSessionError,
    incompleteSession,
    refreshIncompleteSession,
    onAbandonIncompleteSession,
  };
}
