import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { QuestionProgressStatus } from '@/src/domain/value-objects';

export type PracticeFilters = {
  tagSlugs: string[];
  difficulties: Array<NextQuestion['difficulty']>;
  statuses: QuestionProgressStatus[];
};

export function statusDisplayLabel(status: QuestionProgressStatus): string {
  switch (status) {
    case 'unanswered':
      return 'Unanswered';
    case 'incorrect':
      return 'Incorrect';
    case 'marked':
      return 'Marked';
  }
}
