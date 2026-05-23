import { describe, expect, it } from 'vitest';
import type { GetPracticeSessionReviewOutput } from '@/src/application/use-cases/get-practice-session-review';
import { findAdjacentAvailableQuestionId } from './practice-session-question-navigation';

function createNavigator(
  rows: GetPracticeSessionReviewOutput['rows'],
): GetPracticeSessionReviewOutput {
  return {
    sessionId: 'session-1',
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
        questionId: 'q1',
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
        questionId: 'q2',
        order: 2,
        isAvailable: false,
        isAnswered: false,
        isCorrect: null,
        isOmitted: false,
        markedForReview: false,
      },
      {
        questionId: 'q3',
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

    expect(findAdjacentAvailableQuestionId(navigator, 'q1', 1)).toBe('q3');
  });

  it('returns null when the current question is missing from the navigator', () => {
    const navigator = createNavigator([
      {
        questionId: 'q1',
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
