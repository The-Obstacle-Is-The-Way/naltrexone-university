'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { countAvailableQuestions } from '@/src/adapters/controllers/practice-controller';
import {
  AllQuestionProgressStatuses,
  type QuestionDifficulty,
  type QuestionProgressStatus,
} from '@/src/domain/value-objects';
import { logUnhandledAsyncError } from '../fire-and-forget';
import type { PracticeFilters } from '../practice-page-logic';

export type QuickPracticeStatusCounts = Record<
  QuestionProgressStatus,
  number | null
>;

export type QuickPracticeStatusCountFilters = {
  tagSlugs: readonly string[];
  difficulties: readonly QuestionDifficulty[];
};

function createCountInput(input: {
  filters: QuickPracticeStatusCountFilters;
  status: QuestionProgressStatus;
}): {
  tagSlugs: readonly string[];
  difficulties: readonly QuestionDifficulty[];
  statuses: readonly QuestionProgressStatus[];
} {
  return {
    tagSlugs: input.filters.tagSlugs,
    difficulties: input.filters.difficulties,
    statuses: [input.status],
  };
}

export function createEmptyQuickPracticeStatusCounts(): QuickPracticeStatusCounts {
  return {
    unanswered: null,
    incorrect: null,
    bookmarked: null,
  };
}

export function createQuickPracticeStatusCountsEffect(input: {
  countAvailableQuestionsFn: (input: {
    tagSlugs: readonly string[];
    difficulties: readonly QuestionDifficulty[];
    statuses: readonly QuestionProgressStatus[];
  }) => Promise<ActionResult<{ count: number }>>;
  filters: QuickPracticeStatusCountFilters;
  setCounts: (counts: QuickPracticeStatusCounts) => void;
  logError: (message: string, context: unknown) => void;
}): () => void {
  let mounted = true;
  input.setCounts(createEmptyQuickPracticeStatusCounts());

  void (async () => {
    try {
      const responses = await Promise.all(
        AllQuestionProgressStatuses.map(async (status) => ({
          status,
          result: await input.countAvailableQuestionsFn(
            createCountInput({ filters: input.filters, status }),
          ),
        })),
      );

      if (!mounted) return;

      const failed = responses.find((entry) => !entry.result.ok);
      if (failed && !failed.result.ok) {
        input.logError(
          'Failed to count available quick practice questions',
          failed.result.error,
        );
        input.setCounts(createEmptyQuickPracticeStatusCounts());
        return;
      }

      const next = createEmptyQuickPracticeStatusCounts();
      for (const entry of responses) {
        if (entry.result.ok) {
          next[entry.status] = entry.result.data.count;
        }
      }
      input.setCounts(next);
    } catch (error) {
      if (!mounted) return;
      input.logError(
        'Failed to count available quick practice questions',
        error,
      );
      input.setCounts(createEmptyQuickPracticeStatusCounts());
    }
  })();

  return () => {
    mounted = false;
  };
}

export function useQuickPracticeStatusCounts(input: {
  filters: PracticeFilters;
}): QuickPracticeStatusCounts {
  const [counts, setCounts] = useState<QuickPracticeStatusCounts>(() =>
    createEmptyQuickPracticeStatusCounts(),
  );

  const serverFilters = useMemo(
    () => ({
      tagSlugs: input.filters.tagSlugs,
      difficulties: input.filters.difficulty ? [input.filters.difficulty] : [],
    }),
    [input.filters.tagSlugs, input.filters.difficulty],
  );

  useEffect(() => {
    return createQuickPracticeStatusCountsEffect({
      countAvailableQuestionsFn: countAvailableQuestions,
      filters: serverFilters,
      setCounts,
      logError: (message: string, context: unknown) => {
        logUnhandledAsyncError({ message, context });
      },
    });
  }, [serverFilters]);

  return counts;
}
