import { describe, expect, it } from 'vitest';
import { ROUTES } from '@/lib/routes';
import {
  buildHistoryMissedHref,
  buildHistorySessionsHref,
  parseDifficultyFilter,
  parseHistoryTab,
  parseLimit,
  parseNonNegativeInt,
  parseTagSlugFilter,
} from './history-search-params';

describe('app/(app)/app/history/history-search-params', () => {
  describe('parseHistoryTab', () => {
    it('defaults to sessions when value is missing or invalid', () => {
      expect(parseHistoryTab(undefined)).toBe('sessions');
      expect(parseHistoryTab('nope')).toBe('sessions');
    });

    it('parses sessions and missed values', () => {
      expect(parseHistoryTab('sessions')).toBe('sessions');
      expect(parseHistoryTab('missed')).toBe('missed');
    });
  });

  describe('parseNonNegativeInt', () => {
    it('returns fallback for invalid values', () => {
      expect(parseNonNegativeInt(undefined, 5)).toBe(5);
      expect(parseNonNegativeInt('nope', 5)).toBe(5);
      expect(parseNonNegativeInt('-1', 5)).toBe(5);
      expect(parseNonNegativeInt('1.5', 5)).toBe(5);
    });

    it('returns the parsed number for valid non-negative integers', () => {
      expect(parseNonNegativeInt('0', 5)).toBe(0);
      expect(parseNonNegativeInt('10', 5)).toBe(10);
    });
  });

  describe('parseLimit', () => {
    it('defaults to 20', () => {
      expect(parseLimit(undefined)).toBe(20);
      expect(parseLimit('nope')).toBe(20);
      expect(parseLimit('-1')).toBe(20);
    });

    it('clamps to the inclusive range 1..100', () => {
      expect(parseLimit('0')).toBe(1);
      expect(parseLimit('1')).toBe(1);
      expect(parseLimit('100')).toBe(100);
      expect(parseLimit('101')).toBe(100);
    });
  });

  describe('parseDifficultyFilter', () => {
    it('returns null for missing or invalid values', () => {
      expect(parseDifficultyFilter(undefined)).toBeNull();
      expect(parseDifficultyFilter('nope')).toBeNull();
    });

    it('returns parsed difficulty values', () => {
      expect(parseDifficultyFilter('easy')).toBe('easy');
      expect(parseDifficultyFilter('medium')).toBe('medium');
      expect(parseDifficultyFilter('hard')).toBe('hard');
    });
  });

  describe('parseTagSlugFilter', () => {
    it('returns null for missing/blank values', () => {
      expect(parseTagSlugFilter(undefined)).toBeNull();
      expect(parseTagSlugFilter('')).toBeNull();
      expect(parseTagSlugFilter('   ')).toBeNull();
    });

    it('trims whitespace', () => {
      expect(parseTagSlugFilter(' opioids ')).toBe('opioids');
    });
  });

  describe('href builders', () => {
    it('builds sessions tab hrefs with pagination', () => {
      expect(buildHistorySessionsHref({ limit: 20, offset: 0 })).toBe(
        `${ROUTES.APP_HISTORY}?tab=sessions&offset=0&limit=20`,
      );
    });

    it('builds missed tab hrefs with optional filters', () => {
      expect(
        buildHistoryMissedHref({
          limit: 20,
          offset: 0,
        }),
      ).toBe(`${ROUTES.APP_HISTORY}?tab=missed&offset=0&limit=20`);

      expect(
        buildHistoryMissedHref({
          limit: 20,
          offset: 0,
          filters: { difficulty: 'hard', tagSlug: 'alcohol' },
        }),
      ).toBe(
        `${ROUTES.APP_HISTORY}?tab=missed&offset=0&limit=20&difficulty=hard&tag=alcohol`,
      );
    });
  });
});
