import { describe, expect, it } from 'vitest';
import {
  AllQuestionStatuses,
  isValidQuestionStatus,
  isVisibleStatus,
} from './question-status';

describe('QuestionStatus', () => {
  it('contains exactly draft, published, archived', () => {
    expect(AllQuestionStatuses).toEqual(['draft', 'published', 'archived']);
  });

  it('validates known statuses', () => {
    expect(isValidQuestionStatus('draft')).toBe(true);
    expect(isValidQuestionStatus('published')).toBe(true);
    expect(isValidQuestionStatus('archived')).toBe(true);
  });

  it('rejects unknown statuses', () => {
    expect(isValidQuestionStatus('deleted')).toBe(false);
  });

  describe('isVisibleStatus', () => {
    it('returns true only for published', () => {
      expect(isVisibleStatus('draft')).toBe(false);
      expect(isVisibleStatus('published')).toBe(true);
      expect(isVisibleStatus('archived')).toBe(false);
    });
  });
});
