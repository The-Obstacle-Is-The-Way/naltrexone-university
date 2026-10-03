import type { AvailableBookmarkRow } from '@/src/application/ports/bookmarks';
import type { AvailableAttemptedQuestionRow } from '@/src/application/use-cases/get-attempted-questions';
import type { SessionHistoryRow } from '@/src/application/use-cases/get-session-history';
import type { UserStatsOutput } from '@/src/application/use-cases/get-user-stats';

// Rows the history, bookmarks and dashboard views render. Application-owned
// ids default to fresh UUIDs (fixture-integrity.md); a case that asserts on an
// id, such as a link's href, passes its own.

export function createAvailableAttemptedQuestionRow(
  overrides: Partial<AvailableAttemptedQuestionRow> = {},
): AvailableAttemptedQuestionRow {
  return {
    isAvailable: true,
    availability: 'available',
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
    // Every question is published unless a case says otherwise.
    scored: overrides.scored ?? overrides.questionCount ?? 10,
  };
}

export function createUserStatsOutput(
  overrides: Partial<UserStatsOutput> = {},
): UserStatsOutput {
  const totalAnswered = overrides.totalAnswered ?? 0;
  const answeredLast7Days = overrides.answeredLast7Days ?? 0;
  return {
    accuracyOverall: 0,
    unscoredQuestionsOverall: 0,
    accuracyLast7Days: 0,
    unscoredQuestionsLast7Days: 0,
    currentStreakDays: 0,
    recentActivity: [],
    ...overrides,
    totalAnswered,
    answeredLast7Days,
    // Every answer is on a published question unless a case says otherwise.
    scoredOverall: overrides.scoredOverall ?? totalAnswered,
    scoredLast7Days: overrides.scoredLast7Days ?? answeredLast7Days,
  };
}
