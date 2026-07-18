import type { PracticeFilters } from '@/app/(app)/app/practice/practice-page-types';
import {
  getActionResultErrorMessage,
  getThrownErrorMessage,
} from '@/app/(app)/app/shared/error-message-helpers';
import { STANDARD_MUTATION_TIMEOUT_MS } from '@/app/(app)/app/shared/timeout-tiers';
import { toPracticeSessionRoute } from '@/lib/routes';
import { withTimeout } from '@/lib/with-timeout';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { StartPracticeSessionOutput } from '@/src/adapters/controllers/practice-controller';
import {
  IdempotentActionNames,
  isConcurrentRequestInProgressError,
  rotateIdempotencyKeyAfterDeterminateError,
} from '@/src/adapters/controllers/shared/idempotency-error-policy';
import {
  type IncompleteSessionRefreshOutcome,
  refreshProvesNoIncompleteSession,
} from './practice-page-incomplete-session';

const SESSION_START_TIMEOUT_MS = STANDARD_MUTATION_TIMEOUT_MS;

export const SESSION_COUNT_MIN = 1;
export const SESSION_COUNT_MAX = 100;
export const DEFAULT_SESSION_COUNT = 20;

type SessionStartErrorReporter = (
  error: unknown,
  context: { action: string },
) => void;

function reportSessionStartError(
  reportError: SessionStartErrorReporter | undefined,
  error: unknown,
  action: 'startSession' | 'refreshIncompleteSession',
): void {
  try {
    reportError?.(error, { action });
  } catch {
    // Reporter failures must not block the primary error path.
  }
}

export function handleSessionModeChange(
  setSessionMode: (mode: 'tutor' | 'exam') => void,
  event: { target: { value: string } },
): void {
  const value = event.target.value;
  if (value === 'tutor' || value === 'exam') {
    setSessionMode(value);
  }
}

export function handleSessionCountChange(
  setSessionCountInputValue: (value: string) => void,
  setSessionCount: (count: number) => void,
  event: { target: { value: string } },
): void {
  const value = event.target.value;
  setSessionCountInputValue(value);

  if (value === '') {
    return;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return;

  const clamped = Math.min(
    SESSION_COUNT_MAX,
    Math.max(SESSION_COUNT_MIN, Math.trunc(parsed)),
  );
  setSessionCount(clamped);
}

export function handleSessionCountBlur(
  sessionCount: number,
  setSessionCountInputValue: (value: string) => void,
): void {
  setSessionCountInputValue(String(sessionCount));
}

export async function startSession(input: {
  sessionMode: 'tutor' | 'exam';
  sessionCount: number;
  filters: PracticeFilters;
  idempotencyKey: string;
  getLatestIdempotencyKey?: () => string;
  createIdempotencyKey: () => string;
  setIdempotencyKey: (key: string) => void;
  tryRetireIdempotencyKeyAfterProvenAbsence: () => boolean;
  setConcurrentExecutionUncertainty?: (mayStillFinish: boolean) => void;
  startPracticeSessionFn: (
    input: unknown,
  ) => Promise<ActionResult<StartPracticeSessionOutput>>;
  reportError?: SessionStartErrorReporter;
  refreshIncompleteSession?: () => Promise<
    IncompleteSessionRefreshOutcome<unknown>
  >;
  setSessionStartStatus: (status: 'idle' | 'loading' | 'error') => void;
  setSessionStartError: (message: string | null) => void;
  navigateTo: (url: string) => void;
  isMounted?: () => boolean;
}): Promise<void> {
  const isMounted = input.isMounted ?? (() => true);
  const isLatestRequest = () =>
    (input.getLatestIdempotencyKey?.() ?? input.idempotencyKey) ===
    input.idempotencyKey;

  input.setSessionStartStatus('loading');
  input.setSessionStartError(null);

  let res: ActionResult<StartPracticeSessionOutput>;
  try {
    res = await withTimeout(
      input.startPracticeSessionFn({
        mode: input.sessionMode,
        count: input.sessionCount,
        idempotencyKey: input.idempotencyKey,
        tagSlugs: input.filters.tagSlugs,
        difficulties: input.filters.difficulty
          ? [input.filters.difficulty]
          : [],
        statuses: [input.filters.status],
      }),
      SESSION_START_TIMEOUT_MS,
    );
  } catch (error) {
    if (!isLatestRequest()) return;
    reportSessionStartError(input.reportError, error, 'startSession');
    if (!isMounted()) return;
    input.setSessionStartStatus('error');
    input.setSessionStartError(getThrownErrorMessage(error));
    return;
  }
  if (!isMounted()) return;
  if (!isLatestRequest()) return;

  const concurrentRequestMayStillFinish =
    !res.ok && isConcurrentRequestInProgressError(res.error);
  // Each invocation publishes through its owner-issued claim observer. A
  // returned non-concurrent result settles that claim; the typed concurrent
  // result retains uncertainty about another execution. Thrown transport
  // outcomes never reach this observation and remain indeterminate.
  input.setConcurrentExecutionUncertainty?.(concurrentRequestMayStillFinish);

  if (!res.ok) {
    input.setSessionStartStatus('error');
    input.setSessionStartError(getActionResultErrorMessage(res));
    const rotatedAfterDeterminateError =
      rotateIdempotencyKeyAfterDeterminateError(
        IdempotentActionNames.StartPracticeSession,
        res.error,
        () => input.setIdempotencyKey(input.createIdempotencyKey()),
      );
    // Refresh on EVERY failed result, not just the typed conflict: a start
    // whose session committed but whose outcome-store write failed replays a
    // cached INTERNAL_ERROR on retry, and only this refetch can surface the
    // committed session's Resume/Abandon recovery for that arm.
    try {
      const refreshOutcome = await input.refreshIncompleteSession?.();
      if (
        !rotatedAfterDeterminateError &&
        isMounted() &&
        isLatestRequest() &&
        refreshProvesNoIncompleteSession(refreshOutcome)
      ) {
        // Authoritative absence can consume this recovery outcome, but only
        // the key owner can prove that no other same-key claim may still
        // commit. Keep that key-wide policy out of this invocation-local
        // helper.
        input.tryRetireIdempotencyKeyAfterProvenAbsence();
      }
    } catch (error) {
      reportSessionStartError(
        input.reportError,
        error,
        'refreshIncompleteSession',
      );
    }
    return;
  }

  const route = toPracticeSessionRoute(res.data.sessionId);

  if (res.data.actualCount < res.data.requestedCount) {
    const params = new URLSearchParams({ toast: 'session_started' });
    params.set('requestedCount', String(res.data.requestedCount));
    params.set('actualCount', String(res.data.actualCount));
    input.navigateTo(`${route}?${params}`);
    return;
  }

  input.navigateTo(route);
}

function toggleInArray<T>(array: readonly T[], value: T): T[] {
  return array.includes(value)
    ? array.filter((item) => item !== value)
    : [...array, value];
}

export function createSessionModeChangeHandler(input: {
  setSessionMode: (mode: 'tutor' | 'exam') => void;
  setIdempotencyKey: (key: string) => void;
  createIdempotencyKey: () => string;
}): (mode: string) => void {
  return (mode) => {
    if (mode === 'tutor' || mode === 'exam') {
      input.setSessionMode(mode);
      input.setIdempotencyKey(input.createIdempotencyKey());
    }
  };
}

export function createSessionCountChangeHandler(input: {
  setSessionCountInputValue: (value: string) => void;
  setSessionCount: (count: number) => void;
  setIdempotencyKey: (key: string) => void;
  createIdempotencyKey: () => string;
}): (event: { target: { value: string } }) => void {
  return handleSessionCountChange.bind(
    null,
    input.setSessionCountInputValue,
    (count) => {
      input.setSessionCount(count);
      input.setIdempotencyKey(input.createIdempotencyKey());
    },
  );
}

export function createSessionCountBlurHandler(input: {
  sessionCount: number;
  setSessionCountInputValue: (value: string) => void;
}): () => void {
  return handleSessionCountBlur.bind(
    null,
    input.sessionCount,
    input.setSessionCountInputValue,
  );
}

export function createToggleTagHandler(input: {
  setFilters: (
    next: PracticeFilters | ((prev: PracticeFilters) => PracticeFilters),
  ) => void;
  setIdempotencyKey: (key: string) => void;
  createIdempotencyKey: () => string;
}): (slug: string) => void {
  return (slug) => {
    input.setFilters((prev) => ({
      ...prev,
      tagSlugs: toggleInArray(prev.tagSlugs, slug),
    }));
    input.setIdempotencyKey(input.createIdempotencyKey());
  };
}

export function createDifficultyChangeHandler(input: {
  setFilters: (
    next: PracticeFilters | ((prev: PracticeFilters) => PracticeFilters),
  ) => void;
  setIdempotencyKey: (key: string) => void;
  createIdempotencyKey: () => string;
}): (difficulty: PracticeFilters['difficulty']) => void {
  return (difficulty) => {
    input.setFilters((prev) => ({ ...prev, difficulty }));
    input.setIdempotencyKey(input.createIdempotencyKey());
  };
}

export function createStatusChangeHandler(input: {
  setFilters: (
    next: PracticeFilters | ((prev: PracticeFilters) => PracticeFilters),
  ) => void;
  setIdempotencyKey: (key: string) => void;
  createIdempotencyKey: () => string;
}): (status: PracticeFilters['status']) => void {
  return (status) => {
    input.setFilters((prev) => ({ ...prev, status }));
    input.setIdempotencyKey(input.createIdempotencyKey());
  };
}
