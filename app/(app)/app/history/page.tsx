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
  type QuestionsSort,
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

function sortAttemptedRows(
  rows: GetAttemptedQuestionsOutput['rows'],
  sort: QuestionsSort,
): GetAttemptedQuestionsOutput['rows'] {
  const sorted = [...rows];

  if (sort === 'recent') {
    return sorted.sort(
      (a, b) =>
        new Date(b.lastAnsweredAt).getTime() -
        new Date(a.lastAnsweredAt).getTime(),
    );
  }

  if (sort === 'incorrect-first') {
    return sorted.sort((a, b) => {
      if (a.isCorrect === b.isCorrect) {
        return (
          new Date(b.lastAnsweredAt).getTime() -
          new Date(a.lastAnsweredAt).getTime()
        );
      }
      return a.isCorrect ? 1 : -1;
    });
  }

  if (sort === 'correct-first') {
    return sorted.sort((a, b) => {
      if (a.isCorrect === b.isCorrect) {
        return (
          new Date(b.lastAnsweredAt).getTime() -
          new Date(a.lastAnsweredAt).getTime()
        );
      }
      return a.isCorrect ? -1 : 1;
    });
  }

  return sorted.sort((a, b) => {
    const aDifficulty = a.isAvailable ? a.difficulty : 'easy';
    const bDifficulty = b.isAvailable ? b.difficulty : 'easy';
    const difficultyRank = { hard: 0, medium: 1, easy: 2 };
    const rankDiff = difficultyRank[aDifficulty] - difficultyRank[bDifficulty];
    if (rankDiff !== 0) return rankDiff;
    return (
      new Date(b.lastAnsweredAt).getTime() -
      new Date(a.lastAnsweredAt).getTime()
    );
  });
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

      const sortedQuestionsResult: ActionResult<GetAttemptedQuestionsOutput> =
        result.ok
          ? {
              ok: true,
              data: {
                ...result.data,
                rows: sortAttemptedRows(
                  result.data.rows,
                  questionsFilters.sort ?? 'recent',
                ),
              },
            }
          : result;

      return (
        <HistoryPageClient
          activeTab="questions"
          questionsResult={sortedQuestionsResult}
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
