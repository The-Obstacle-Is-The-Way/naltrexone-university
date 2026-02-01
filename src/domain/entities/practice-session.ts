import type { PracticeMode, QuestionDifficulty } from '../value-objects';

/**
 * PracticeSession entity - a study session.
 */
export type PracticeSession = {
  readonly id: string;
  readonly userId: string;
  readonly mode: PracticeMode;
  readonly questionIds: readonly string[]; // ordered list (UUIDs)
  readonly tagFilters: readonly string[]; // tag slugs used for selection
  readonly difficultyFilters: readonly QuestionDifficulty[]; // filters used for selection
  readonly startedAt: Date;
  readonly endedAt: Date | null;
};
