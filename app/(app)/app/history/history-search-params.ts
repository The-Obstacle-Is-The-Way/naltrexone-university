import { ROUTES } from '@/lib/routes';
import { normalizeSearchParam } from '@/lib/search-params';
import { MAX_PAGINATION_LIMIT } from '@/src/adapters/shared/validation-limits';
import {
  isValidDifficulty,
  type QuestionDifficulty,
} from '@/src/domain/value-objects';

export type HistoryTab = 'sessions' | 'questions';
export type SessionModeFilter = 'all' | 'tutor' | 'exam';

export type DifficultyFilter = QuestionDifficulty;

export type ResultFilter = 'correct' | 'incorrect';
export type SourceFilter = 'tutor' | 'exam' | 'adhoc';
export type QuestionsSort =
  | 'recent'
  | 'incorrect-first'
  | 'correct-first'
  | 'difficulty';

export type QuestionsFilters = {
  difficulty?: DifficultyFilter | null;
  tagSlug?: string | null;
  result?: ResultFilter | null;
  source?: SourceFilter | null;
  sort?: QuestionsSort | null;
};

export function parseHistoryTab(
  value: string | string[] | undefined,
): HistoryTab {
  const normalized = normalizeSearchParam(value);
  if (normalized === 'questions') return 'questions';
  return 'sessions';
}

export function parseNonNegativeInt(
  value: string | string[] | undefined,
  fallback: number,
): number {
  const normalized = normalizeSearchParam(value);
  if (normalized === undefined || normalized === '') return fallback;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return fallback;
  if (!Number.isInteger(n)) return fallback;
  if (n < 0) return fallback;
  return n;
}

export function parseLimit(value: string | string[] | undefined): number {
  const limit = parseNonNegativeInt(value, 20);
  return Math.min(Math.max(limit, 1), MAX_PAGINATION_LIMIT);
}

export function parseDifficultyFilter(
  value: string | string[] | undefined,
): DifficultyFilter | null {
  const normalized = normalizeSearchParam(value);
  if (normalized && isValidDifficulty(normalized)) return normalized;
  return null;
}

export function parseTagSlugFilter(
  value: string | string[] | undefined,
): string | null {
  const normalized = normalizeSearchParam(value);
  const trimmed = normalized?.trim();
  return trimmed ? trimmed : null;
}

export function parseResultFilter(
  value: string | string[] | undefined,
): ResultFilter | null {
  const normalized = normalizeSearchParam(value);
  if (normalized === 'correct') return normalized;
  if (normalized === 'incorrect') return normalized;
  return null;
}

export function parseSourceFilter(
  value: string | string[] | undefined,
): SourceFilter | null {
  const normalized = normalizeSearchParam(value);
  if (normalized === 'tutor') return normalized;
  if (normalized === 'exam') return normalized;
  if (normalized === 'adhoc') return normalized;
  return null;
}

export function parseSessionModeFilter(
  value: string | string[] | undefined,
): SessionModeFilter {
  const normalized = normalizeSearchParam(value);
  if (normalized === 'tutor') return normalized;
  if (normalized === 'exam') return normalized;
  return 'all';
}

export function parseQuestionsSort(
  value: string | string[] | undefined,
): QuestionsSort {
  const normalized = normalizeSearchParam(value);
  if (normalized === 'incorrect-first') return normalized;
  if (normalized === 'correct-first') return normalized;
  if (normalized === 'difficulty') return normalized;
  return 'recent';
}

export function buildHistorySessionsHref(input: {
  limit: number;
  offset: number;
  mode?: SessionModeFilter | undefined;
}): string {
  const params = new URLSearchParams();
  params.set('tab', 'sessions');
  params.set('offset', String(input.offset));
  params.set('limit', String(input.limit));
  if (input.mode && input.mode !== 'all') {
    params.set('mode', input.mode);
  }
  return `${ROUTES.APP_HISTORY}?${params.toString()}`;
}

export function buildHistoryQuestionsHref(input: {
  limit: number;
  offset: number;
  filters?: QuestionsFilters | undefined;
}): string {
  const params = new URLSearchParams();
  params.set('tab', 'questions');
  params.set('offset', String(input.offset));
  params.set('limit', String(input.limit));

  const difficulty = input.filters?.difficulty ?? null;
  const tagSlug = input.filters?.tagSlug ?? null;
  const result = input.filters?.result ?? null;
  const source = input.filters?.source ?? null;
  const sort = input.filters?.sort ?? null;

  if (difficulty) params.set('difficulty', difficulty);
  if (tagSlug) params.set('tag', tagSlug);
  if (result) params.set('result', result);
  if (source) params.set('source', source);
  if (sort && sort !== 'recent') params.set('sort', sort);

  return `${ROUTES.APP_HISTORY}?${params.toString()}`;
}
