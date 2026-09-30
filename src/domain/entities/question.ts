import type { QuestionDifficulty, QuestionStatus } from '../value-objects';
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
  readonly slug: string;
  readonly stemMd: string;
  readonly explanationMd: string;
  readonly referenceMd: string | null;
  readonly difficulty: QuestionDifficulty;
  readonly status: QuestionStatus;
  readonly choices: readonly Choice[];
  readonly tags: readonly Tag[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
