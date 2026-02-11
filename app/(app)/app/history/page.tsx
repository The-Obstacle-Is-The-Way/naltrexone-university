import type { Metadata } from 'next';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import {
  type GetSessionHistoryOutput,
  getSessionHistory,
} from '@/src/adapters/controllers/practice-controller';
import {
  type GetAttemptedQuestionsOutput,
  getAttemptedQuestions,
} from '@/src/adapters/controllers/review-controller';
import { HistoryPageClient } from './history-page-client';
import {
  parseDifficultyFilter,
  parseHistoryTab,
  parseLimit,
  parseNonNegativeInt,
  parseResultFilter,
  parseSourceFilter,
  parseTagSlugFilter,
  type QuestionsFilters,
} from './history-search-params';

export const metadata: Metadata = {
  title: 'History - Addiction Boards',
};

type HistorySearchParams = {
  tab?: string;
  limit?: string;
  offset?: string;
  difficulty?: string;
  tag?: string;
  result?: string;
  source?: string;
};

export function createHistoryPage(deps?: {
  getSessionHistoryFn?: typeof getSessionHistory;
  getAttemptedQuestionsFn?: typeof getAttemptedQuestions;
}) {
  const getSessionHistoryFn = deps?.getSessionHistoryFn ?? getSessionHistory;
  const getAttemptedQuestionsFn =
    deps?.getAttemptedQuestionsFn ?? getAttemptedQuestions;

  return async function HistoryPage({
    searchParams,
  }: {
    searchParams: Promise<HistorySearchParams>;
  }) {
    const params = await searchParams;
    const rawTab = params.tab;
    const activeTab = parseHistoryTab(rawTab);
    const limit = parseLimit(params.limit);
    const offset = parseNonNegativeInt(params.offset, 0);

    const defaultResultFilter =
      rawTab === 'missed' ? ('incorrect' as const) : null;

    const questionsFilters: QuestionsFilters = {
      difficulty: parseDifficultyFilter(params.difficulty),
      tagSlug: parseTagSlugFilter(params.tag),
      result: parseResultFilter(params.result) ?? defaultResultFilter,
      source: parseSourceFilter(params.source),
    };

    if (activeTab === 'questions') {
      const result: ActionResult<GetAttemptedQuestionsOutput> =
        await getAttemptedQuestionsFn({
          limit,
          offset,
          result: questionsFilters.result ?? undefined,
          source: questionsFilters.source ?? undefined,
        });

      return (
        <HistoryPageClient
          activeTab="questions"
          questionsResult={result}
          questionsFilters={questionsFilters}
        />
      );
    }

    const result: ActionResult<GetSessionHistoryOutput> =
      await getSessionHistoryFn({
        limit,
        offset,
      });

    return <HistoryPageClient activeTab="sessions" sessionsResult={result} />;
  };
}

export default createHistoryPage();
