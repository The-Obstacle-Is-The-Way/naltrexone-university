import { describe, expect, it, vi } from 'vitest';
import type { GetPracticeSessionReviewOutput } from '@/src/application/use-cases/get-practice-session-review';
import { findAdjacentAvailableQuestionId } from './practice-session-question-navigation';

const {
  fixtureQuestion1Id,
  fixtureQuestion2Id,
  fixtureQuestion3Id,
  fixtureSession1Id,
} = vi.hoisted(() => ({
  fixtureQuestion1Id: crypto.randomUUID(),
  fixtureQuestion2Id: crypto.randomUUID(),
  fixtureQuestion3Id: crypto.randomUUID(),
  fixtureSession1Id: crypto.randomUUID(),
}));

function createNavigator(
  rows: GetPracticeSessionReviewOutput['rows'],
): GetPracticeSessionReviewOutput {
  return {
    sessionId: fixtureSession1Id,
    mode: 'exam',
    totalCount: rows.length,
    answeredCount: rows.filter((row) => row.isAnswered).length,
    markedCount: rows.filter((row) => row.markedForReview).length,
    rows,
  };
}

describe('findAdjacentAvailableQuestionId', () => {
  it('skips unavailable rows when resolving the next question', () => {
    const navigator = createNavigator([
      {
        questionId: fixtureQuestion1Id,
        slug: 'q-1',
        order: 1,
        isAvailable: true,
        stemMd: 'Stem 1',
        difficulty: 'easy',
        isAnswered: true,
        isCorrect: true,
        isOmitted: false,
        markedForReview: false,
      },
      {
        questionId: fixtureQuestion2Id,
        order: 2,
        isAvailable: false,
        isAnswered: false,
        isCorrect: null,
        isOmitted: false,
        markedForReview: false,
      },
      {
        questionId: fixtureQuestion3Id,
        slug: 'q-3',
        order: 3,
        isAvailable: true,
        stemMd: 'Stem 3',
        difficulty: 'medium',
        isAnswered: false,
        isCorrect: null,
        isOmitted: false,
        markedForReview: false,
      },
    ]);

    expect(
      findAdjacentAvailableQuestionId(navigator, fixtureQuestion1Id, 1),
    ).toBe(fixtureQuestion3Id);
  });

  it('returns null when the current question is missing from the navigator', () => {
    const navigator = createNavigator([
      {
        questionId: fixtureQuestion1Id,
        slug: 'q-1',
        order: 1,
        isAvailable: true,
        stemMd: 'Stem 1',
        difficulty: 'easy',
        isAnswered: true,
        isCorrect: true,
        isOmitted: false,
        markedForReview: false,
      },
    ]);

    expect(
      findAdjacentAvailableQuestionId(navigator, 'missing', -1),
    ).toBeNull();
  });
});
