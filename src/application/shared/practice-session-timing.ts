import type { PracticeSession } from '@/src/domain/entities';
import { getPracticeSessionTiming } from '@/src/domain/services';

export type PracticeSessionTimingSnapshot = {
  deadlineAt: string | null;
  remainingMs: number | null;
};

export function getPracticeSessionTimingSnapshot(
  session: PracticeSession,
  now: Date,
): PracticeSessionTimingSnapshot {
  const timing = getPracticeSessionTiming(session, now);
  return {
    deadlineAt: timing.deadline?.toISOString() ?? null,
    remainingMs: timing.remainingMs,
  };
}
