import type { PracticeSessionQuestionState } from '../entities';

export type SessionStats = {
  answered: number;
  correct: number;
};

const MS_PER_SECOND = 1000;

/**
 * Compute answered/correct counts from mutable per-question session state (pure function).
 */
export function computeSessionStats(
  questionStates: readonly PracticeSessionQuestionState[],
): SessionStats {
  const answeredStates = questionStates.filter(
    (state) => state.latestSelectedChoiceId !== null,
  );

  return {
    answered: answeredStates.length,
    correct: answeredStates.filter((state) => state.latestIsCorrect === true)
      .length,
  };
}

/**
 * Compute elapsed duration in seconds between two timestamps (pure function).
 */
export function computeSessionDurationSeconds(
  startedAt: Date,
  endedAt: Date,
): number {
  const startedAtMs = startedAt.getTime();
  const endedAtMs = endedAt.getTime();
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(endedAtMs)) return 0;

  return Math.max(0, Math.floor((endedAtMs - startedAtMs) / MS_PER_SECOND));
}

export function createDefaultQuestionState(
  questionId: string,
): PracticeSessionQuestionState {
  return {
    questionId,
    markedForReview: false,
    latestSelectedChoiceId: null,
    latestIsCorrect: null,
    latestAnsweredAt: null,
  };
}
