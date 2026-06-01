import { describe, expect, it } from 'vitest';
import {
  AllQuestionFeedbackRatings,
  isValidQuestionFeedbackRating,
} from './question-feedback-rating';

describe('QuestionFeedbackRating', () => {
  it('defines the supported feedback ratings', () => {
    expect(AllQuestionFeedbackRatings).toEqual(['helpful', 'not_helpful']);
  });

  it('validates known feedback ratings', () => {
    expect(isValidQuestionFeedbackRating('helpful')).toBe(true);
    expect(isValidQuestionFeedbackRating('not_helpful')).toBe(true);
  });

  it('rejects unknown feedback ratings', () => {
    expect(isValidQuestionFeedbackRating('neutral')).toBe(false);
  });
});
