import type {
  QuestionAvailability,
  QuestionDifficulty,
  QuestionStatus,
} from '../value-objects';
import type { Choice } from './choice';
import type { Tag } from './tag';

/**
 * Question entity - a single MCQ item.
 */
export type Question = {
  readonly id: string;
  /** The revision whose content this carries (ADR-021). */
  readonly revisionId: string;
  /**
   * Whether that revision is still the question's current one. A review of a
   * session item or attempt may carry an older revision (ADR-021 §3).
   */
  readonly isCurrentRevision: boolean;
  /**
   * Whether that revision's answer key differs from the current revision's
   * (ADR-022 Decision 4). False for the current revision.
   */
  readonly answerKeyChanged: boolean;
  readonly slug: string;
  readonly stemMd: string;
  readonly explanationMd: string;
  readonly referenceMd: string | null;
  readonly difficulty: QuestionDifficulty;
  readonly status: QuestionStatus;
  /**
   * What a learner is told about the question now, from its status and its
   * withdrawals and holds (ADR-022 Decision 1).
   */
  readonly availability: QuestionAvailability;
  readonly choices: readonly Choice[];
  readonly tags: readonly Tag[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
