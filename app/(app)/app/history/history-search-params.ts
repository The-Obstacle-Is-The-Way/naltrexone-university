import { ROUTES } from '@/lib/routes';

export type HistoryTab = 'sessions' | 'missed';

export type DifficultyFilter = 'easy' | 'medium' | 'hard';

export type MissedFilters = {
  difficulty?: DifficultyFilter | null;
  tagSlug?: string | null;
};

export function parseHistoryTab(value: string | undefined): HistoryTab {
  if (value === 'missed') return 'missed';
  return 'sessions';
}

export function parseNonNegativeInt(
  value: string | undefined,
  fallback: number,
): number {
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

export function buildHistoryMissedHref(input: {
  limit: number;
  offset: number;
  filters?: MissedFilters;
}): string {
  const params = new URLSearchParams();
  params.set('tab', 'missed');
  params.set('offset', String(input.offset));
  params.set('limit', String(input.limit));

  const difficulty = input.filters?.difficulty ?? null;
  const tagSlug = input.filters?.tagSlug ?? null;

  if (difficulty) params.set('difficulty', difficulty);
  if (tagSlug) params.set('tag', tagSlug);

  return `${ROUTES.APP_HISTORY}?${params.toString()}`;
}
