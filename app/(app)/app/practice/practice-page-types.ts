import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type {
  QuestionDifficulty,
  QuestionProgressStatus,
} from '@/src/domain/value-objects';

export type PracticeFilters = {
  tagSlugs: string[];
  difficulty: NextQuestion['difficulty'] | null;
  status: QuestionProgressStatus;
};

function assertUnreachable(value: never): never {
  throw new Error(`Unhandled QuestionProgressStatus: ${value}`);
}

export function statusDisplayLabel(status: QuestionProgressStatus): string {
  switch (status) {
    case 'unanswered':
      return 'Unanswered';
    case 'incorrect':
      return 'Incorrect';
    case 'bookmarked':
      return 'Bookmarked';
    default:
      return assertUnreachable(status);
  }
}

function assertUnreachableDifficulty(value: never): never {
  throw new Error(`Unhandled QuestionDifficulty: ${value}`);
}

export function difficultyDisplayLabel(difficulty: QuestionDifficulty): string {
  switch (difficulty) {
    case 'easy':
      return 'Easy';
    case 'medium':
      return 'Medium';
    case 'hard':
      return 'Hard';
    default:
      return assertUnreachableDifficulty(difficulty);
  }
}
