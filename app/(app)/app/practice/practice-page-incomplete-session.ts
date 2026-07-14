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

export type IncompleteSessionRefreshOutcome<T> =
  | { kind: 'loaded'; session: T | null }
  | { kind: 'failed' }
  | { kind: 'ignored' };

export function refreshProvesNoIncompleteSession<T>(
  outcome: IncompleteSessionRefreshOutcome<T> | undefined,
): outcome is { kind: 'loaded'; session: null } {
  return outcome?.kind === 'loaded' && outcome.session === null;
}

export type IncompleteSessionLoadGuard = {
  begin: () => () => boolean;
};

export function createIncompleteSessionLoadGuard(): IncompleteSessionLoadGuard {
  let latestGeneration = 0;

  return {
    begin: () => {
      latestGeneration += 1;
      const requestGeneration = latestGeneration;
      return () => requestGeneration === latestGeneration;
    },
  };
}

type LoadIncompleteSessionInput<T> = {
  getIncompletePracticeSessionFn: (
    input: unknown,
  ) => Promise<ActionResult<T | null>>;
  setIncompleteSessionStatus: (status: IncompleteSessionStatus) => void;
  setIncompleteSessionError: (message: string | null) => void;
  setIncompleteSession: (session: T | null) => void;
  isActive?: () => boolean;
  loadGuard?: IncompleteSessionLoadGuard;
};

export async function loadIncompleteSession<T>(
  input: LoadIncompleteSessionInput<T>,
): Promise<IncompleteSessionRefreshOutcome<T>> {
  const isActive = input.isActive ?? (() => true);
  if (!isActive()) return { kind: 'ignored' };
  const isLatestLoad = input.loadGuard?.begin() ?? (() => true);
  const canCommit = () => isActive() && isLatestLoad();
  if (!canCommit()) return { kind: 'ignored' };
  input.setIncompleteSessionStatus('loading');
  if (!canCommit()) return { kind: 'ignored' };
  input.setIncompleteSessionError(null);

  let res: Awaited<ReturnType<typeof input.getIncompletePracticeSessionFn>>;
  try {
    res = await withTimeout(
      input.getIncompletePracticeSessionFn({}),
      INCOMPLETE_SESSION_TIMEOUT_MS,
    );
  } catch (error) {
    if (!canCommit()) return { kind: 'ignored' };
    reportClientError(error, {
      component: 'PracticePageIncompleteSession',
      action: 'loadIncompleteSession',
    });
    if (!canCommit()) return { kind: 'ignored' };
    input.setIncompleteSessionStatus('error');
    if (!canCommit()) return { kind: 'ignored' };
    input.setIncompleteSessionError(getThrownErrorMessage(error));
    return { kind: 'failed' };
  }
  if (!canCommit()) return { kind: 'ignored' };

  if (!res.ok) {
    input.setIncompleteSessionStatus('error');
    if (!canCommit()) return { kind: 'ignored' };
    input.setIncompleteSessionError(getActionResultErrorMessage(res));
    return { kind: 'failed' };
  }

  input.setIncompleteSession(res.data);
  if (!canCommit()) return { kind: 'ignored' };
  input.setIncompleteSessionStatus('idle');
  return { kind: 'loaded', session: res.data };
}

export function createIncompleteSessionEffect<T>(
  input: LoadIncompleteSessionInput<T>,
): () => void {
  let mounted = true;
  void loadIncompleteSession({
    ...input,
    isActive: () => mounted,
  });

  return () => {
    mounted = false;
  };
}

/**
 * An abandon idempotency key bound to the session it was minted for. The
 * wrapper replays a completed cached outcome for a reused key, so a key that
 * carried one session's abandon must never travel with a different session:
 * the replayed success would clear the panel without ending the new session.
 */
export type AbandonRequestToken = {
  sessionId: string;
  key: string;
};

export function resolveAbandonRequestToken(
  token: AbandonRequestToken | null,
  sessionId: string,
  createIdempotencyKey: () => string,
): AbandonRequestToken {
  if (token && token.sessionId === sessionId) return token;
  return { sessionId, key: createIdempotencyKey() };
}

/** Resolves true only when the abandon completed successfully while mounted. */
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
}): Promise<boolean> {
  if (!input.isMounted()) return false;

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
    if (!input.isMounted()) return false;
    reportClientError(error, {
      component: 'PracticePageIncompleteSession',
      action: 'abandonIncompleteSession',
    });
    // Outcome-indeterminate: the abandon may have committed server-side, and
    // the preserved key is the only handle to its recorded outcome.
    input.setIncompleteSessionStatus('error');
    input.setIncompleteSessionError(getThrownErrorMessage(error));
    return false;
  }
  if (!input.isMounted()) return false;

  if (!res.ok) {
    // Do not infer lifecycle resolution from a broad conflict. The owner
    // refreshes authoritative incomplete-session state after every failed
    // abandon and retires keys only when that read proves absence.
    input.setIncompleteSessionStatus('error');
    input.setIncompleteSessionError(getActionResultErrorMessage(res));
    return false;
  }

  // A consumed success is terminal for this key: the panel clears, so any
  // later abandon necessarily targets a different session and must not
  // replay this outcome.
  input.rotateIdempotencyKey?.();
  input.setIncompleteSession(null);
  input.setIncompleteSessionStatus('idle');
  return true;
}
