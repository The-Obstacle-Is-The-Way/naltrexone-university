'use client';

import { useEffect, useMemo, useState } from 'react';
import { reportClientError } from '@/lib/report-client-error';
import { countAvailableQuestions } from '@/src/adapters/controllers/practice-controller';
import {
  type AvailableQuestionsCountFilters,
  type AvailableQuestionsCountStatus,
  createAvailableQuestionsCountEffect,
  toAvailableQuestionsCountFilters,
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

  const serverFilters: AvailableQuestionsCountFilters = useMemo(
    () =>
      toAvailableQuestionsCountFilters({
        tagSlugs: input.filters.tagSlugs,
        difficulty: input.filters.difficulty,
        status: input.filters.status,
      }),
    [input.filters.tagSlugs, input.filters.difficulty, input.filters.status],
  );

  useEffect(() => {
    return createAvailableQuestionsCountEffect({
      countAvailableQuestionsFn: countAvailableQuestions,
      filters: serverFilters,
      setAvailableCountStatus,
      setAvailableCount,
      logError: (_message: string, error: unknown) => {
        reportClientError(error, {
          component: 'UsePracticeAvailableQuestionsCount',
          action: 'loadAvailableCount',
        });
      },
    });
  }, [serverFilters]);

  return {
    availableCountStatus,
    availableCount,
  };
}
