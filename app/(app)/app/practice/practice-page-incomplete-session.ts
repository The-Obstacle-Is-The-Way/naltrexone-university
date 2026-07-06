import {
  getActionResultErrorMessage,
  getThrownErrorMessage,
} from '@/app/(app)/app/shared/error-message-helpers';
import {
  STANDARD_MUTATION_TIMEOUT_MS,
  STANDARD_READ_TIMEOUT_MS,
} from '@/app/(app)/app/shared/timeout-tiers';
import { reportClientError } from '@/lib/report-client-error';
import { withTimeout } from '@/lib/with-timeout';
import type { ActionResult } from '@/src/adapters/controllers/action-result';

const INCOMPLETE_SESSION_TIMEOUT_MS = STANDARD_READ_TIMEOUT_MS;
const ABANDON_SESSION_TIMEOUT_MS = STANDARD_MUTATION_TIMEOUT_MS;

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
      res = await withTimeout(
        input.getIncompletePracticeSessionFn({}),
        INCOMPLETE_SESSION_TIMEOUT_MS,
      );
    } catch (error) {
      if (!mounted) return;
      reportClientError(error, {
        component: 'PracticePageIncompleteSession',
        action: 'loadIncompleteSession',
      });
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
  idempotencyKey: string;
  rotateIdempotencyKey?: () => void;
  mode: 'tutor' | 'exam';
  endPracticeSessionFn: (input: unknown) => Promise<ActionResult<unknown>>;
  discardPracticeSessionFn: (input: unknown) => Promise<ActionResult<unknown>>;
  setIncompleteSessionStatus: (status: IncompleteSessionStatus) => void;
  setIncompleteSessionError: (message: string | null) => void;
  setIncompleteSession: (session: T | null) => void;
  isMounted: () => boolean;
}): Promise<void> {
  if (!input.isMounted()) return;

  input.setIncompleteSessionStatus('loading');
  input.setIncompleteSessionError(null);

  const abandonSessionFn =
    input.mode === 'exam'
      ? input.discardPracticeSessionFn
      : input.endPracticeSessionFn;

  let res: Awaited<ReturnType<typeof abandonSessionFn>>;
  try {
    res = await withTimeout(
      abandonSessionFn({
        sessionId: input.sessionId,
        idempotencyKey: input.idempotencyKey,
      }),
      ABANDON_SESSION_TIMEOUT_MS,
    );
  } catch (error) {
    if (!input.isMounted()) return;
    reportClientError(error, {
      component: 'PracticePageIncompleteSession',
      action: 'abandonIncompleteSession',
    });
    input.rotateIdempotencyKey?.();
    input.setIncompleteSessionStatus('error');
    input.setIncompleteSessionError(getThrownErrorMessage(error));
    return;
  }
  if (!input.isMounted()) return;

  if (!res.ok) {
    input.rotateIdempotencyKey?.();
    input.setIncompleteSessionStatus('error');
    input.setIncompleteSessionError(getActionResultErrorMessage(res));
    return;
  }

  input.setIncompleteSession(null);
  input.setIncompleteSessionStatus('idle');
}
