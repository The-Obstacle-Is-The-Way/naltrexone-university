import type { Metadata } from 'next';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import {
  type GetSessionHistoryOutput,
  getSessionHistory,
} from '@/src/adapters/controllers/practice-controller';
import {
  type GetMissedQuestionsOutput,
  getMissedQuestions,
} from '@/src/adapters/controllers/review-controller';
import { HistoryPageClient } from './history-page-client';
import type { MissedFilters } from './history-search-params';
import {
  parseDifficultyFilter,
  parseHistoryTab,
  parseLimit,
  parseNonNegativeInt,
  parseTagSlugFilter,
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
};

export function createHistoryPage(deps?: {
  getSessionHistoryFn?: typeof getSessionHistory;
  getMissedQuestionsFn?: typeof getMissedQuestions;
}) {
  const getSessionHistoryFn = deps?.getSessionHistoryFn ?? getSessionHistory;
  const getMissedQuestionsFn = deps?.getMissedQuestionsFn ?? getMissedQuestions;

  return async function HistoryPage({
    searchParams,
  }: {
    searchParams: Promise<HistorySearchParams>;
  }) {
    const params = await searchParams;
    const activeTab = parseHistoryTab(params.tab);
    const limit = parseLimit(params.limit);
    const offset = parseNonNegativeInt(params.offset, 0);

    const missedFilters: MissedFilters = {
      difficulty: parseDifficultyFilter(params.difficulty),
      tagSlug: parseTagSlugFilter(params.tag),
    };

    if (activeTab === 'missed') {
      const result: ActionResult<GetMissedQuestionsOutput> =
        await getMissedQuestionsFn({ limit, offset });

      return (
        <HistoryPageClient
          activeTab="missed"
          missedResult={result}
          missedFilters={missedFilters}
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
