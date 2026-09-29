import type { AvailableBookmarkRow } from '@/src/application/ports/bookmarks';
import type { AvailableAttemptedQuestionRow } from '@/src/application/use-cases/get-attempted-questions';
import type { SessionHistoryRow } from '@/src/application/use-cases/get-session-history';

// Rows the history, bookmarks and dashboard views render. Application-owned
// ids default to fresh UUIDs (fixture-integrity.md); a case that asserts on an
// id, such as a link's href, passes its own.

export function createAvailableAttemptedQuestionRow(
  overrides: Partial<AvailableAttemptedQuestionRow> = {},
): AvailableAttemptedQuestionRow {
  return {
    isAvailable: true,
    withdrawn: false,
    questionId: crypto.randomUUID(),
    isCorrect: false,
    sessionId: null,
    sessionMode: null,
    slug: 'q-1',
    stemMd: 'Stem for q1',
    difficulty: 'easy',
    tagSlugs: [],
    lastAnsweredAt: '2026-02-01T00:00:00.000Z',
    ...overrides,
  };
}

export function createAvailableBookmarkRow(
  overrides: Partial<AvailableBookmarkRow> = {},
): AvailableBookmarkRow {
  return {
    isAvailable: true,
    questionId: crypto.randomUUID(),
    slug: 'q-1',
    stemMd: 'Stem for q1',
    difficulty: 'easy',
    bookmarkedAt: '2026-02-01T00:00:00.000Z',
    ...overrides,
  };
}

export function createSessionHistoryRow(
  overrides: Partial<SessionHistoryRow> = {},
): SessionHistoryRow {
  return {
    sessionId: crypto.randomUUID(),
    mode: 'exam',
    questionCount: 10,
    firstQuestionSlug: 'q-1',
    answered: 10,
    correct: 8,
    accuracy: 0.8,
    durationSeconds: 1200,
    startedAt: '2026-02-07T00:00:00.000Z',
    endedAt: '2026-02-07T00:20:00.000Z',
    ...overrides,
  };
}
