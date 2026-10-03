import type { PracticeMode, QuestionDifficulty } from '../value-objects';

/**
 * PracticeSession entity - a study session.
 */
export type PracticeSessionQuestionState = {
  readonly questionId: string;
  /**
   * The question revision this item shows and grades (ADR-021), bound when the
   * session began.
   */
  readonly questionRevisionId: string;
  readonly markedForReview: boolean;
  readonly latestSelectedChoiceId: string | null;
  readonly latestIsCorrect: boolean | null;
  readonly latestAnsweredAt: Date | null;
  readonly draftSelectedChoiceId: string | null;
  readonly draftSavedAt: Date | null;
  readonly draftCumulativeMs: number;
  /**
   * Whether the learner had a fair chance at the item, recorded when the
   * session ends (ADR-022 Amendment). Null while the session is active, and
   * for a session that ended before it was recorded.
   */
  readonly fairChanceAtEnd: boolean | null;
};

export type PracticeSession = {
  readonly id: string;
  readonly userId: string;
  readonly mode: PracticeMode;
  readonly questionIds: readonly string[]; // ordered list (UUIDs)
  readonly questionStates: readonly PracticeSessionQuestionState[]; // persisted per-question session state
  readonly tagFilters: readonly string[]; // tag slugs used for selection
  readonly difficultyFilters: readonly QuestionDifficulty[]; // filters used for selection
  readonly startedAt: Date;
  readonly endedAt: Date | null;
};
