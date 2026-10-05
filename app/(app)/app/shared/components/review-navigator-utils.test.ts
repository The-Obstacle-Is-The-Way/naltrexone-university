import { describe, expect, it } from 'vitest';
import {
  getReviewStatusLabel,
  getReviewVariant,
  isResultNotScored,
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

// ADR-022 Amendment 2026-10-05 (DEBT-498): a result no score counts, because
// its content is in doubt, is named as such rather than graded.
describe('isResultNotScored', () => {
  it.each([
    [true, 'withdrawn', false, true],
    [false, 'under_review', false, true],
    [true, null, false, true],
    [true, 'available', true, true],
    [true, 'retired', true, true],
    [true, 'available', false, false],
    [false, 'retired', false, false],
    [null, 'withdrawn', false, false],
  ] as const)(
    'a result %s on a question %s, key corrected %s, is not scored: %s',
    (isCorrect, availability, answerKeyChanged, notScored) => {
      expect(
        isResultNotScored({ isCorrect, availability, answerKeyChanged }),
      ).toBe(notScored);
    },
  );
});

describe('a result that is not scored', () => {
  it('is labelled Not scored, whatever its stored grade', () => {
    expect(getReviewStatusLabel(true, { notScored: true })).toBe('Not scored');
    expect(getReviewStatusLabel(false, { notScored: true })).toBe('Not scored');
  });

  it('takes the neutral secondary variant', () => {
    expect(getReviewVariant(true, { notScored: true })).toBe('secondary');
  });

  it('stays Unanswered when there is no answer', () => {
    expect(getReviewStatusLabel(null, { notScored: true })).toBe('Unanswered');
    expect(getReviewVariant(null, { notScored: true })).toBe('outline');
  });
});
