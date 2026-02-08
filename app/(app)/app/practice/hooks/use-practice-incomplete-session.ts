import { useCallback, useEffect, useState } from 'react';
import {
  endPracticeSession,
  type GetIncompletePracticeSessionOutput,
  getIncompletePracticeSession,
} from '@/src/adapters/controllers/practice-controller';
import {
  abandonIncompleteSession,
  createIncompleteSessionEffect,
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
    return createIncompleteSessionEffect({
      getIncompletePracticeSessionFn: getIncompletePracticeSession,
      setIncompleteSessionStatus,
      setIncompleteSessionError,
      setIncompleteSession,
    });
  }, []);

  const onAbandonIncompleteSession = useCallback(async () => {
    if (!incompleteSession) return;

    await abandonIncompleteSession({
      sessionId: incompleteSession.sessionId,
      endPracticeSessionFn: endPracticeSession,
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
    onAbandonIncompleteSession,
  };
}
