import { describe, expect, it } from 'vitest';
import {
  AllQuestionFeedbackCategories,
  isValidQuestionFeedbackCategory,
} from './question-feedback-category';

describe('QuestionFeedbackCategory', () => {
  it('defines the supported feedback categories', () => {
    expect(AllQuestionFeedbackCategories).toEqual([
      'incorrect_answer',
      'ambiguous_wording',
      'typo_formatting',
      'outdated_reference',
      'other',
    ]);
  });

  it('validates known feedback categories', () => {
    expect(isValidQuestionFeedbackCategory('incorrect_answer')).toBe(true);
    expect(isValidQuestionFeedbackCategory('ambiguous_wording')).toBe(true);
    expect(isValidQuestionFeedbackCategory('typo_formatting')).toBe(true);
    expect(isValidQuestionFeedbackCategory('outdated_reference')).toBe(true);
    expect(isValidQuestionFeedbackCategory('other')).toBe(true);
  });

  it('rejects unknown feedback categories', () => {
    expect(isValidQuestionFeedbackCategory('bad_reference')).toBe(false);
  });
});
