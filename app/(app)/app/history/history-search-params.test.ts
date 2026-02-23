import { describe, expect, it } from 'vitest';
import { ROUTES } from '@/lib/routes';
import {
  buildHistoryQuestionsHref,
  buildHistorySessionsHref,
  parseDifficultyFilter,
  parseHistoryTab,
  parseLimit,
  parseNonNegativeInt,
  parseQuestionsSort,
  parseResultFilter,
  parseSessionModeFilter,
  parseSourceFilter,
  parseTagSlugFilter,
} from './history-search-params';

describe('app/(app)/app/history/history-search-params', () => {
  describe('parseHistoryTab', () => {
    it('defaults to sessions when value is missing or invalid', () => {
      expect(parseHistoryTab(undefined)).toBe('sessions');
      expect(parseHistoryTab('nope')).toBe('sessions');
    });

    it('parses sessions and questions values', () => {
      expect(parseHistoryTab('sessions')).toBe('sessions');
      expect(parseHistoryTab('questions')).toBe('questions');
    });
  });

  describe('parseNonNegativeInt', () => {
    it('returns fallback for invalid values', () => {
      expect(parseNonNegativeInt(undefined, 5)).toBe(5);
      expect(parseNonNegativeInt('', 5)).toBe(5);
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

  describe('parseResultFilter', () => {
    it('returns null for missing or invalid values', () => {
      expect(parseResultFilter(undefined)).toBeNull();
      expect(parseResultFilter('nope')).toBeNull();
    });

    it('returns parsed result values', () => {
      expect(parseResultFilter('correct')).toBe('correct');
      expect(parseResultFilter('incorrect')).toBe('incorrect');
    });
  });

  describe('parseSourceFilter', () => {
    it('returns null for missing or invalid values', () => {
      expect(parseSourceFilter(undefined)).toBeNull();
      expect(parseSourceFilter('nope')).toBeNull();
    });

    it('returns parsed source values', () => {
      expect(parseSourceFilter('tutor')).toBe('tutor');
      expect(parseSourceFilter('exam')).toBe('exam');
      expect(parseSourceFilter('adhoc')).toBe('adhoc');
    });
  });

  describe('parseSessionModeFilter', () => {
    it('defaults to all for missing or invalid values', () => {
      expect(parseSessionModeFilter(undefined)).toBe('all');
      expect(parseSessionModeFilter('nope')).toBe('all');
    });

    it('parses tutor and exam values', () => {
      expect(parseSessionModeFilter('tutor')).toBe('tutor');
      expect(parseSessionModeFilter('exam')).toBe('exam');
    });
  });

  describe('parseQuestionsSort', () => {
    it('defaults to recent for missing or invalid values', () => {
      expect(parseQuestionsSort(undefined)).toBe('recent');
      expect(parseQuestionsSort('nope')).toBe('recent');
    });

    it('parses supported sort values', () => {
      expect(parseQuestionsSort('recent')).toBe('recent');
      expect(parseQuestionsSort('incorrect-first')).toBe('incorrect-first');
      expect(parseQuestionsSort('correct-first')).toBe('correct-first');
      expect(parseQuestionsSort('difficulty')).toBe('difficulty');
    });
  });

  describe('href builders', () => {
    it('builds sessions tab hrefs with pagination', () => {
      expect(buildHistorySessionsHref({ limit: 20, offset: 0 })).toBe(
        `${ROUTES.APP_HISTORY}?tab=sessions&offset=0&limit=20`,
      );

      expect(
        buildHistorySessionsHref({ limit: 20, offset: 0, mode: 'tutor' }),
      ).toBe(`${ROUTES.APP_HISTORY}?tab=sessions&offset=0&limit=20&mode=tutor`);
    });

    it('builds questions tab hrefs with pagination and optional filters', () => {
      expect(buildHistoryQuestionsHref({ limit: 20, offset: 0 })).toBe(
        `${ROUTES.APP_HISTORY}?tab=questions&offset=0&limit=20`,
      );

      expect(
        buildHistoryQuestionsHref({
          limit: 20,
          offset: 0,
          filters: { result: 'correct' },
        }),
      ).toBe(
        `${ROUTES.APP_HISTORY}?tab=questions&offset=0&limit=20&result=correct`,
      );

      expect(
        buildHistoryQuestionsHref({
          limit: 20,
          offset: 0,
          filters: { source: 'adhoc' },
        }),
      ).toBe(
        `${ROUTES.APP_HISTORY}?tab=questions&offset=0&limit=20&source=adhoc`,
      );

      expect(
        buildHistoryQuestionsHref({
          limit: 20,
          offset: 0,
          filters: {
            difficulty: 'hard',
            tagSlug: 'alcohol',
            result: 'incorrect',
            source: 'exam',
            sort: 'incorrect-first',
          },
        }),
      ).toBe(
        `${ROUTES.APP_HISTORY}?tab=questions&offset=0&limit=20&difficulty=hard&tag=alcohol&result=incorrect&source=exam&sort=incorrect-first`,
      );
    });
  });
});
