import type { Metadata } from 'next';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import {
  type GetSessionHistoryOutput,
  getSessionHistory,
} from '@/src/adapters/controllers/practice-controller';
import { getAttemptedQuestions } from '@/src/adapters/controllers/review-controller';
import {
  getTags,
  type TagRow,
} from '@/src/adapters/controllers/tag-controller';
import { HistoryPageClient } from './history-page-client';
import {
  parseDifficultyFilter,
  parseHistoryTab,
  parseLimit,
  parseNonNegativeInt,
  parseQuestionsSort,
  parseResultFilter,
  parseSessionModeFilter,
  parseSourceFilter,
  parseTagSlugFilter,
  type QuestionsFilters,
} from './history-search-params';

export const maxDuration = 30;

export const metadata: Metadata = {
  title: 'History - Addiction Boards',
};

type HistorySearchParams = {
  tab?: string;
  limit?: string;
  offset?: string;
  mode?: string;
  difficulty?: string;
  tag?: string;
  result?: string;
  source?: string;
  sort?: string;
};

type VisibleTagKind = 'topic' | 'substance' | 'treatment';

function isVisibleTagKind(kind: TagRow['kind']): kind is VisibleTagKind {
  return kind === 'topic' || kind === 'substance' || kind === 'treatment';
}

function getTagKindSortValue(kind: VisibleTagKind): number {
  if (kind === 'topic') return 0;
  if (kind === 'substance') return 1;
  return 2;
}

export function createHistoryPage(deps?: {
  getSessionHistoryFn?: typeof getSessionHistory;
  getAttemptedQuestionsFn?: typeof getAttemptedQuestions;
  getTagsFn?: typeof getTags;
}) {
  const getSessionHistoryFn = deps?.getSessionHistoryFn ?? getSessionHistory;
  const getAttemptedQuestionsFn =
    deps?.getAttemptedQuestionsFn ?? getAttemptedQuestions;
  const getTagsFn = deps?.getTagsFn ?? getTags;

  return async function HistoryPage({
    searchParams,
  }: {
    searchParams: Promise<HistorySearchParams>;
  }) {
    const params = await searchParams;
    const activeTab = parseHistoryTab(params.tab);
    const limit = parseLimit(params.limit);
    const offset = parseNonNegativeInt(params.offset, 0);

    if (activeTab === 'questions') {
      const questionsFilters: QuestionsFilters = {
        difficulty: parseDifficultyFilter(params.difficulty),
        tagSlug: parseTagSlugFilter(params.tag),
        result: parseResultFilter(params.result),
        source: parseSourceFilter(params.source),
        sort: parseQuestionsSort(params.sort),
      };

      const [result, tagsResult] = await Promise.all([
        getAttemptedQuestionsFn({
          limit,
          offset,
          result: questionsFilters.result ?? undefined,
          source: questionsFilters.source ?? undefined,
          difficulty: questionsFilters.difficulty ?? undefined,
          tagSlug: questionsFilters.tagSlug ?? undefined,
          sort: questionsFilters.sort ?? undefined,
        }),
        getTagsFn({}),
      ]);

      const tagOptions = tagsResult.ok
        ? tagsResult.data.rows
            .filter((t): t is TagRow & { kind: VisibleTagKind } =>
              isVisibleTagKind(t.kind),
            )
            .map((t) => ({ slug: t.slug, name: t.name, kind: t.kind }))
            .sort(
              (a, b) =>
                getTagKindSortValue(a.kind) - getTagKindSortValue(b.kind) ||
                a.name.localeCompare(b.name) ||
                a.slug.localeCompare(b.slug),
            )
        : [];

      return (
        <HistoryPageClient
          activeTab="questions"
          questionsResult={result}
          questionsFilters={questionsFilters}
          questionsTagOptions={tagOptions}
        />
      );
    }

    const modeFilter = parseSessionModeFilter(params.mode);
    const result: ActionResult<GetSessionHistoryOutput> =
      await getSessionHistoryFn({
        limit,
        offset,
        mode: modeFilter === 'all' ? undefined : modeFilter,
      });

    return (
      <HistoryPageClient
        activeTab="sessions"
        sessionsResult={result}
        sessionsModeFilter={modeFilter}
      />
    );
  };
}

export default createHistoryPage();
