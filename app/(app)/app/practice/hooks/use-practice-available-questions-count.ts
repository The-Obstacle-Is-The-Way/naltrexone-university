'use client';

import { useEffect, useMemo, useState } from 'react';
import { countAvailableQuestions } from '@/src/adapters/controllers/practice-controller';
import {
  type AvailableQuestionsCountStatus,
  createAvailableQuestionsCountEffect,
} from '../practice-page-available-count';
import type { PracticeFilters } from '../practice-page-logic';

export type UsePracticeAvailableQuestionsCountOutput = {
  availableCountStatus: AvailableQuestionsCountStatus;
  availableCount: number | null;
};

export function usePracticeAvailableQuestionsCount(input: {
  filters: PracticeFilters;
}): UsePracticeAvailableQuestionsCountOutput {
  const [availableCountStatus, setAvailableCountStatus] =
    useState<AvailableQuestionsCountStatus>('loading');
  const [availableCount, setAvailableCount] = useState<number | null>(null);

  const serverFilters = useMemo(
    () => ({
      tagSlugs: input.filters.tagSlugs,
      difficulties: input.filters.difficulty ? [input.filters.difficulty] : [],
      statuses: [input.filters.status],
    }),
    [input.filters.tagSlugs, input.filters.difficulty, input.filters.status],
  );

  useEffect(() => {
    return createAvailableQuestionsCountEffect({
      countAvailableQuestionsFn: countAvailableQuestions,
      filters: serverFilters,
      setAvailableCountStatus,
      setAvailableCount,
      logError: (message: string, context: unknown) => {
        console.error(
          'createAvailableQuestionsCountEffect failed:',
          message,
          context,
        );
      },
    });
  }, [serverFilters]);

  return {
    availableCountStatus,
    availableCount,
  };
}
