import type { ChoiceLabel } from '../value-objects';

/**
 * Choice entity - an answer option for a question.
 */
export type Choice = {
  readonly id: string;
  readonly questionId: string;
  readonly label: ChoiceLabel;
  readonly textMd: string;
  readonly isCorrect: boolean;
  readonly explanationMd: string | null;
  readonly sortOrder: number;
};
