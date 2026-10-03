import { describe, expect, it } from 'vitest';
import {
  AllQuestionAvailabilities,
  deriveQuestionAvailability,
  NO_QUESTION_OVERLAY,
} from './question-availability';

// ADR-022 Decision 1: one state per question, derived at read time, with a
// withdrawal winning over a hold.
describe('QuestionAvailability', () => {
  it('contains exactly available, withdrawn, under_review, retired', () => {
    expect(AllQuestionAvailabilities).toEqual([
      'available',
      'withdrawn',
      'under_review',
      'retired',
    ]);
  });

  it.each([
    ['published', false, false, 'available'],
    ['published', true, true, 'available'],
    ['archived', true, false, 'withdrawn'],
    ['archived', true, true, 'withdrawn'],
    ['archived', false, true, 'under_review'],
    ['archived', false, false, 'retired'],
    ['draft', false, true, 'under_review'],
    ['draft', false, false, 'retired'],
  ] as const)(
    'derives a %s question with withdrawn=%s and underReview=%s as %s',
    (status, withdrawn, underReview, expected) => {
      expect(
        deriveQuestionAvailability(status, { withdrawn, underReview }),
      ).toBe(expected);
    },
  );

  it('has no overlay by default', () => {
    expect(NO_QUESTION_OVERLAY).toEqual({
      withdrawn: false,
      underReview: false,
    });
  });
});
