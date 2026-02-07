import type { NextQuestion } from '@/src/application/use-cases/get-next-question';

export type PracticeFilters = {
  tagSlugs: string[];
  difficulties: Array<NextQuestion['difficulty']>;
};
