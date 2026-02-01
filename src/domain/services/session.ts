import type { PracticeSession } from '../entities';
import { shouldShowExplanationForMode } from '../value-objects/practice-mode';

export type SessionProgress = {
  current: number;
  total: number;
  isComplete: boolean;
};

/**
 * Compute session progress (pure function).
 */
export function computeSessionProgress(
  session: PracticeSession,
  attemptCount: number,
): SessionProgress {
  const total = session.questionIds.length;
  const safeAttemptCount = Math.max(0, attemptCount);

  return {
    current: Math.min(safeAttemptCount, total),
    total,
    isComplete: safeAttemptCount >= total,
  };
}

/**
 * Determine if explanation should be shown for the current session state (pure function).
 */
export function shouldShowExplanation(session: PracticeSession): boolean {
  return shouldShowExplanationForMode(session.mode, session.endedAt !== null);
}

/**
 * Get next question ID in session (pure function).
 */
export function getNextQuestionId(
  session: PracticeSession,
  answeredQuestionIds: readonly string[],
): string | null {
  const answered = new Set(answeredQuestionIds);
  for (const questionId of session.questionIds) {
    if (!answered.has(questionId)) return questionId;
  }
  return null;
}
