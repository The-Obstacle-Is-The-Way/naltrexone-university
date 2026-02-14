import { describe, expect, it } from 'vitest';
import {
  AllQuestionProgressStatuses,
  isValidQuestionProgressStatus,
} from './question-progress-status';

describe('QuestionProgressStatus', () => {
  it('has exactly 3 statuses', () => {
    expect(AllQuestionProgressStatuses).toEqual([
      'unanswered',
      'incorrect',
      'bookmarked',
    ]);
  });

  it('validates known statuses', () => {
    expect(isValidQuestionProgressStatus('unanswered')).toBe(true);
    expect(isValidQuestionProgressStatus('incorrect')).toBe(true);
    expect(isValidQuestionProgressStatus('bookmarked')).toBe(true);
  });

  it('rejects unknown statuses', () => {
    expect(isValidQuestionProgressStatus('all')).toBe(false);
    expect(isValidQuestionProgressStatus('correct')).toBe(false);
    expect(isValidQuestionProgressStatus('marked')).toBe(false);
  });
});
