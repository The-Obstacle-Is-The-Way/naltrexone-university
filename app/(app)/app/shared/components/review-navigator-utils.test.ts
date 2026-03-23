import { describe, expect, it } from 'vitest';
import {
  getReviewStatusLabel,
  getReviewVariant,
} from './review-navigator-utils';

describe('getReviewVariant', () => {
  it('returns success when the review result is correct', () => {
    expect(getReviewVariant(true)).toBe('success');
  });

  it('returns destructive when the review result is incorrect', () => {
    expect(getReviewVariant(false)).toBe('destructive');
  });

  it('returns outline when the review result is unanswered', () => {
    expect(getReviewVariant(null)).toBe('outline');
  });
});

describe('getReviewStatusLabel', () => {
  it('returns Correct when the review result is correct', () => {
    expect(getReviewStatusLabel(true)).toBe('Correct');
  });

  it('returns Incorrect when the review result is incorrect', () => {
    expect(getReviewStatusLabel(false)).toBe('Incorrect');
  });

  it('returns Unanswered when the review result is unanswered', () => {
    expect(getReviewStatusLabel(null)).toBe('Unanswered');
  });
});
