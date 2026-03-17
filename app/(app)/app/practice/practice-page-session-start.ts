import {
  getActionResultErrorMessage,
  getThrownErrorMessage,
} from '@/app/(app)/app/practice/practice-logic';
import type { PracticeFilters } from '@/app/(app)/app/practice/practice-page-types';
import { STANDARD_MUTATION_TIMEOUT_MS } from '@/app/(app)/app/shared/timeout-tiers';
import { toPracticeSessionRoute } from '@/lib/routes';
import { withTimeout } from '@/lib/with-timeout';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { StartPracticeSessionOutput } from '@/src/adapters/controllers/practice-controller';

const SESSION_START_TIMEOUT_MS = STANDARD_MUTATION_TIMEOUT_MS;

export const SESSION_COUNT_MIN = 1;
export const SESSION_COUNT_MAX = 100;
export const DEFAULT_SESSION_COUNT = 20;

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
  createIdempotencyKey: () => string;
  setIdempotencyKey: (key: string) => void;
  startPracticeSessionFn: (
    input: unknown,
  ) => Promise<ActionResult<StartPracticeSessionOutput>>;
  reportError?: (error: unknown, context: { action: string }) => void;
  setSessionStartStatus: (status: 'idle' | 'loading' | 'error') => void;
  setSessionStartError: (message: string | null) => void;
  navigateTo: (url: string) => void;
  isMounted?: () => boolean;
}): Promise<void> {
  const isMounted = input.isMounted ?? (() => true);

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
    try {
      input.reportError?.(error, { action: 'startSession' });
    } catch {
      // Reporter failures must not block the primary error path.
    }
    if (!isMounted()) return;
    input.setSessionStartStatus('error');
    input.setSessionStartError(getThrownErrorMessage(error));
    input.setIdempotencyKey(input.createIdempotencyKey());
    return;
  }
  if (!isMounted()) return;

  if (!res.ok) {
    input.setSessionStartStatus('error');
    input.setSessionStartError(getActionResultErrorMessage(res));
    input.setIdempotencyKey(input.createIdempotencyKey());
    return;
  }

  const params = new URLSearchParams({ toast: 'session_started' });
  if (res.data.actualCount < res.data.requestedCount) {
    params.set('requestedCount', String(res.data.requestedCount));
    params.set('actualCount', String(res.data.actualCount));
  }
  input.navigateTo(`${toPracticeSessionRoute(res.data.sessionId)}?${params}`);
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
