import type { Question } from '../entities';
import { DomainError } from '../errors/domain-errors';
import type { ChoiceLabel } from '../value-objects';

export type GradeResult = {
  isCorrect: boolean;
  correctChoiceId: string;
  correctLabel: ChoiceLabel;
};

/**
 * Grade an answer (pure function, no side effects).
 */
export function gradeAnswer(
  question: Question,
  selectedChoiceId: string,
): GradeResult {
  const selected = question.choices.find((c) => c.id === selectedChoiceId);
  if (!selected) {
    throw new DomainError(
      'INVALID_CHOICE',
      `Choice ${selectedChoiceId} does not belong to question ${question.id}`,
    );
  }

  const correctChoices = question.choices.filter((c) => c.isCorrect);
  if (correctChoices.length !== 1) {
    throw new DomainError(
      'INVALID_QUESTION',
      `Question ${question.id} must have exactly 1 correct choice (found ${correctChoices.length})`,
    );
  }

  const correct = correctChoices[0];

  return {
    isCorrect: selected.id === correct.id,
    correctChoiceId: correct.id,
    correctLabel: correct.label,
  };
}
