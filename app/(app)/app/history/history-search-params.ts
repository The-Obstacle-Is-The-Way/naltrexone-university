import { ROUTES } from '@/lib/routes';

export type HistoryTab = 'sessions' | 'questions';

export type DifficultyFilter = 'easy' | 'medium' | 'hard';

export type ResultFilter = 'correct' | 'incorrect';
export type SourceFilter = 'tutor' | 'exam' | 'adhoc';

export type QuestionsFilters = {
  difficulty?: DifficultyFilter | null;
  tagSlug?: string | null;
  result?: ResultFilter | null;
  source?: SourceFilter | null;
};

export function parseHistoryTab(value: string | undefined): HistoryTab {
  if (value === 'questions') return 'questions';
  return 'sessions';
}

export function parseNonNegativeInt(
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (!Number.isInteger(n)) return fallback;
  if (n < 0) return fallback;
  return n;
}

export function parseLimit(value: string | undefined): number {
  const limit = parseNonNegativeInt(value, 20);
  return Math.min(Math.max(limit, 1), 100);
}

export function parseDifficultyFilter(
  value: string | undefined,
): DifficultyFilter | null {
  if (value === 'easy') return value;
  if (value === 'medium') return value;
  if (value === 'hard') return value;
  return null;
}

export function parseTagSlugFilter(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function parseResultFilter(
  value: string | undefined,
): ResultFilter | null {
  if (value === 'correct') return value;
  if (value === 'incorrect') return value;
  return null;
}

export function parseSourceFilter(
  value: string | undefined,
): SourceFilter | null {
  if (value === 'tutor') return value;
  if (value === 'exam') return value;
  if (value === 'adhoc') return value;
  return null;
}

export function buildHistorySessionsHref(input: {
  limit: number;
  offset: number;
}): string {
  const params = new URLSearchParams();
  params.set('tab', 'sessions');
  params.set('offset', String(input.offset));
  params.set('limit', String(input.limit));
  return `${ROUTES.APP_HISTORY}?${params.toString()}`;
}

export function buildHistoryQuestionsHref(input: {
  limit: number;
  offset: number;
  filters?: QuestionsFilters;
}): string {
  const params = new URLSearchParams();
  params.set('tab', 'questions');
  params.set('offset', String(input.offset));
  params.set('limit', String(input.limit));

  const difficulty = input.filters?.difficulty ?? null;
  const tagSlug = input.filters?.tagSlug ?? null;
  const result = input.filters?.result ?? null;
  const source = input.filters?.source ?? null;

  if (difficulty) params.set('difficulty', difficulty);
  if (tagSlug) params.set('tag', tagSlug);
  if (result) params.set('result', result);
  if (source) params.set('source', source);

  return `${ROUTES.APP_HISTORY}?${params.toString()}`;
}
