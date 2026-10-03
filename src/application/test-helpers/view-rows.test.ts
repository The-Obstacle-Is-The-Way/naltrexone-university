import { describe, expect, it } from 'vitest';
import {
  createAvailableAttemptedQuestionRow,
  createAvailableBookmarkRow,
  createSessionHistoryRow,
} from './view-rows';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('view-row factories', () => {
  it('builds an available attempted-question row with a generated question id', () => {
    const row = createAvailableAttemptedQuestionRow();

    expect(row).toEqual({
      isAvailable: true,
      availability: 'available',
      questionId: expect.stringMatching(UUID_PATTERN),
      isCorrect: false,
      sessionId: null,
      sessionMode: null,
      slug: 'q-1',
      stemMd: 'Stem for q1',
      difficulty: 'easy',
      tagSlugs: [],
      lastAnsweredAt: '2026-02-01T00:00:00.000Z',
    });
    expect(createAvailableAttemptedQuestionRow().questionId).not.toBe(
      row.questionId,
    );
  });

  it('builds an available bookmark row with a generated question id', () => {
    expect(createAvailableBookmarkRow({ slug: 'q-2' })).toEqual({
      isAvailable: true,
      questionId: expect.stringMatching(UUID_PATTERN),
      slug: 'q-2',
      stemMd: 'Stem for q1',
      difficulty: 'easy',
      bookmarkedAt: '2026-02-01T00:00:00.000Z',
    });
  });

  it('builds a completed exam session row with a generated session id', () => {
    expect(createSessionHistoryRow({ correct: 9 })).toEqual({
      sessionId: expect.stringMatching(UUID_PATTERN),
      mode: 'exam',
      questionCount: 10,
      firstQuestionSlug: 'q-1',
      answered: 10,
      correct: 9,
      accuracy: 0.8,
      durationSeconds: 1200,
      startedAt: '2026-02-07T00:00:00.000Z',
      endedAt: '2026-02-07T00:20:00.000Z',
    });
  });
});
