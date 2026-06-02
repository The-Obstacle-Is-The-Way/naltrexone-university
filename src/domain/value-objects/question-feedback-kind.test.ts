import { describe, expect, it } from 'vitest';
import {
  AllQuestionFeedbackKinds,
  isValidQuestionFeedbackKind,
} from './question-feedback-kind';

describe('QuestionFeedbackKind', () => {
  it('defines the supported feedback kinds', () => {
    expect(AllQuestionFeedbackKinds).toEqual(['rating', 'report']);
  });

  it('validates known feedback kinds', () => {
    expect(isValidQuestionFeedbackKind('rating')).toBe(true);
    expect(isValidQuestionFeedbackKind('report')).toBe(true);
  });

  it('rejects unknown feedback kinds', () => {
    expect(isValidQuestionFeedbackKind('comment')).toBe(false);
  });
});
