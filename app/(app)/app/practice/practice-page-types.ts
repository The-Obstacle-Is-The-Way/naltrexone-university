import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { QuestionProgressStatus } from '@/src/domain/value-objects';

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
