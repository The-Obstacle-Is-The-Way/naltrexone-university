import {
  getActionResultErrorMessage,
  getThrownErrorMessage,
} from '@/app/(app)/app/practice/practice-logic';
import type { ActionResult } from '@/src/adapters/controllers/action-result';

export type IncompleteSessionStatus = 'idle' | 'loading' | 'error';

export function createIncompleteSessionEffect<T>(input: {
  getIncompletePracticeSessionFn: (
    input: unknown,
  ) => Promise<ActionResult<T | null>>;
  setIncompleteSessionStatus: (status: IncompleteSessionStatus) => void;
  setIncompleteSessionError: (message: string | null) => void;
  setIncompleteSession: (session: T | null) => void;
}): () => void {
  let mounted = true;
  input.setIncompleteSessionStatus('loading');
  input.setIncompleteSessionError(null);

  void (async () => {
    let res: Awaited<ReturnType<typeof input.getIncompletePracticeSessionFn>>;
    try {
      res = await input.getIncompletePracticeSessionFn({});
    } catch (error) {
      if (!mounted) return;
      input.setIncompleteSessionStatus('error');
      input.setIncompleteSessionError(getThrownErrorMessage(error));
      return;
    }
    if (!mounted) return;

    if (!res.ok) {
      input.setIncompleteSessionStatus('error');
      input.setIncompleteSessionError(getActionResultErrorMessage(res));
      return;
    }

    input.setIncompleteSession(res.data);
    input.setIncompleteSessionStatus('idle');
  })();

  return () => {
    mounted = false;
  };
}

export async function abandonIncompleteSession<T>(input: {
  sessionId: string;
  endPracticeSessionFn: (input: unknown) => Promise<ActionResult<unknown>>;
  setIncompleteSessionStatus: (status: IncompleteSessionStatus) => void;
  setIncompleteSessionError: (message: string | null) => void;
  setIncompleteSession: (session: T | null) => void;
  isMounted: () => boolean;
}): Promise<void> {
  input.setIncompleteSessionStatus('loading');
  input.setIncompleteSessionError(null);

  let res: Awaited<ReturnType<typeof input.endPracticeSessionFn>>;
  try {
    res = await input.endPracticeSessionFn({
      sessionId: input.sessionId,
      idempotencyKey: input.sessionId,
    });
  } catch (error) {
    if (!input.isMounted()) return;
    input.setIncompleteSessionStatus('error');
    input.setIncompleteSessionError(getThrownErrorMessage(error));
    return;
  }
  if (!input.isMounted()) return;

  if (!res.ok) {
    input.setIncompleteSessionStatus('error');
    input.setIncompleteSessionError(getActionResultErrorMessage(res));
    return;
  }

  input.setIncompleteSession(null);
  input.setIncompleteSessionStatus('idle');
}
