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
      'marked',
    ]);
  });

  it('validates known statuses', () => {
    expect(isValidQuestionProgressStatus('unanswered')).toBe(true);
    expect(isValidQuestionProgressStatus('incorrect')).toBe(true);
    expect(isValidQuestionProgressStatus('marked')).toBe(true);
  });

  it('rejects unknown statuses', () => {
    expect(isValidQuestionProgressStatus('all')).toBe(false);
    expect(isValidQuestionProgressStatus('correct')).toBe(false);
  });
});
