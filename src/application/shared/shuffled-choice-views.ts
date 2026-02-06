import { ApplicationError } from '@/src/application/errors';
import type { Question } from '@/src/domain/entities';
import { createQuestionSeed, shuffleWithSeed } from '@/src/domain/services';
import { AllChoiceLabels } from '@/src/domain/value-objects';

export type ShuffledChoiceView = {
  choiceId: string;
  displayLabel: string;
  textMd: string;
  sortOrder: number;
  isCorrect: boolean;
  explanationMd: string | null;
};

export function buildShuffledChoiceViews(
  question: Question,
  userId: string,
): ShuffledChoiceView[] {
  const seed = createQuestionSeed(userId, question.id);
  const stableInput = question.choices.slice().sort((a, b) => {
    const bySortOrder = a.sortOrder - b.sortOrder;
    if (bySortOrder !== 0) return bySortOrder;
    return a.id.localeCompare(b.id);
  });
  const shuffledChoices = shuffleWithSeed(stableInput, seed);

  return shuffledChoices.map((choice, index) => {
    const displayLabel = AllChoiceLabels[index];
    if (!displayLabel) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        `Question ${question.id} has too many choices`,
      );
    }

    return {
      choiceId: choice.id,
      displayLabel,
      textMd: choice.textMd,
      sortOrder: index + 1,
      isCorrect: choice.isCorrect,
      explanationMd: choice.explanationMd,
    };
  });
}
