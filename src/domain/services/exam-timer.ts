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
  const deadline = computeExamDeadline(session);
  return deadline !== null && now.getTime() >= deadline.getTime();
}
