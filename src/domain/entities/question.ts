import type { QuestionDifficulty, QuestionStatus } from '../value-objects';
import type { Choice } from './choice';
import type { Tag } from './tag';

/**
 * Question entity - a single MCQ item.
 */
export type Question = {
  readonly id: string;
  readonly slug: string;
  readonly stemMd: string;
  readonly explanationMd: string;
  readonly difficulty: QuestionDifficulty;
  readonly status: QuestionStatus;
  readonly choices: readonly Choice[];
  readonly tags: readonly Tag[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
