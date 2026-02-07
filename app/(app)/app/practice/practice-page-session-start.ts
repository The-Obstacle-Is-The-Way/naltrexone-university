import {
  getActionResultErrorMessage,
  getThrownErrorMessage,
} from '@/app/(app)/app/practice/practice-logic';
import type { PracticeFilters } from '@/app/(app)/app/practice/practice-page-types';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { StartPracticeSessionOutput } from '@/src/adapters/controllers/practice-controller';

export const SESSION_COUNT_MIN = 1;
export const SESSION_COUNT_MAX = 100;

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
  setSessionCount: (count: number) => void,
  event: { target: { value: string } },
): void {
  const parsed = Number(event.target.value);
  if (!Number.isFinite(parsed)) {
    setSessionCount(SESSION_COUNT_MIN);
    return;
  }

  const clamped = Math.min(
    SESSION_COUNT_MAX,
    Math.max(SESSION_COUNT_MIN, Math.trunc(parsed)),
  );
  setSessionCount(clamped);
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
    res = await input.startPracticeSessionFn({
      mode: input.sessionMode,
      count: input.sessionCount,
      idempotencyKey: input.idempotencyKey,
      tagSlugs: input.filters.tagSlugs,
      difficulties: input.filters.difficulties,
    });
  } catch (error) {
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

  input.navigateTo(`/app/practice/${res.data.sessionId}`);
}
