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
import { PracticeSessionConflictReasons } from '@/src/application/errors';

const INCOMPLETE_SESSION_TIMEOUT_MS = STANDARD_READ_TIMEOUT_MS;
const ABANDON_SESSION_TIMEOUT_MS = STANDARD_MUTATION_TIMEOUT_MS;

export type IncompleteSessionStatus = 'idle' | 'loading' | 'error';

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
): Promise<void> {
  const isActive = input.isActive ?? (() => true);
  if (!isActive()) return;
  const isLatestLoad = input.loadGuard?.begin() ?? (() => true);
  const canCommit = () => isActive() && isLatestLoad();
  if (!canCommit()) return;
  input.setIncompleteSessionStatus('loading');
  if (!canCommit()) return;
  input.setIncompleteSessionError(null);

  let res: Awaited<ReturnType<typeof input.getIncompletePracticeSessionFn>>;
  try {
    res = await withTimeout(
      input.getIncompletePracticeSessionFn({}),
      INCOMPLETE_SESSION_TIMEOUT_MS,
    );
  } catch (error) {
    if (!canCommit()) return;
    reportClientError(error, {
      component: 'PracticePageIncompleteSession',
      action: 'loadIncompleteSession',
    });
    if (!canCommit()) return;
    input.setIncompleteSessionStatus('error');
    if (!canCommit()) return;
    input.setIncompleteSessionError(getThrownErrorMessage(error));
    return;
  }
  if (!canCommit()) return;

  if (!res.ok) {
    input.setIncompleteSessionStatus('error');
    if (!canCommit()) return;
    input.setIncompleteSessionError(getActionResultErrorMessage(res));
    return;
  }

  input.setIncompleteSession(res.data);
  if (!canCommit()) return;
  input.setIncompleteSessionStatus('idle');
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

function isCachedTerminalLifecycleConflict(
  res: Extract<ActionResult<unknown>, { ok: false }>,
): boolean {
  if (res.error.code !== 'CONFLICT') return false;
  const reason = res.error.details?.reason;
  return (
    reason === PracticeSessionConflictReasons.AlreadyEnded ||
    reason === PracticeSessionConflictReasons.ExamTimeExpired
  );
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
    // Outcome-indeterminate: the abandon may have committed server-side, and
    // the preserved key is the only handle to its recorded outcome.
    input.setIncompleteSessionStatus('error');
    input.setIncompleteSessionError(getThrownErrorMessage(error));
    return;
  }
  if (!input.isMounted()) return;

  if (!res.ok) {
    // Rotate only for the terminal conflicts the lifecycle policy caches;
    // every other failure aborts the claim server-side, so the same-key
    // retry re-executes (rotating would orphan that path).
    if (isCachedTerminalLifecycleConflict(res)) {
      input.rotateIdempotencyKey?.();
    }
    input.setIncompleteSessionStatus('error');
    input.setIncompleteSessionError(getActionResultErrorMessage(res));
    return;
  }

  input.setIncompleteSession(null);
  input.setIncompleteSessionStatus('idle');
}
