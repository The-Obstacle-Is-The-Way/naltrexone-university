import type { PracticeSession } from '../entities';
import { EXAM_SECONDS_PER_QUESTION, MS_PER_SECOND } from './time-constants';

export function computeExamAllotmentSeconds(
  session: PracticeSession,
): number | null {
  if (session.mode !== 'exam') return null;
  return session.questionIds.length * EXAM_SECONDS_PER_QUESTION;
}

export function computeExamDeadline(session: PracticeSession): Date | null {
  const allotmentSeconds = computeExamAllotmentSeconds(session);
  if (allotmentSeconds === null) return null;
  return new Date(
    session.startedAt.getTime() + allotmentSeconds * MS_PER_SECOND,
  );
}

export type PracticeSessionTiming = {
  state: 'active' | 'expired' | 'ended';
  deadline: Date | null;
  remainingMs: number | null;
};

export function getPracticeSessionTiming(
  session: PracticeSession,
  now: Date,
): PracticeSessionTiming {
  const deadline = computeExamDeadline(session);
  const remainingMs =
    deadline === null ? null : Math.max(0, deadline.getTime() - now.getTime());

  return {
    state: session.endedAt ? 'ended' : remainingMs === 0 ? 'expired' : 'active',
    deadline,
    remainingMs: session.endedAt && remainingMs !== null ? 0 : remainingMs,
  };
}

export function remainingExamSeconds(
  session: PracticeSession,
  now: Date,
): number {
  const deadline = computeExamDeadline(session);
  if (deadline === null) return Number.POSITIVE_INFINITY;
  return Math.max(
    0,
    Math.floor((deadline.getTime() - now.getTime()) / MS_PER_SECOND),
  );
}

export function isExamExpired(session: PracticeSession, now: Date): boolean {
  return getPracticeSessionTiming(session, now).state === 'expired';
}
