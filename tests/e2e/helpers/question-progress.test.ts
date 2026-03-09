import { describe, expect, it } from 'vitest';
import { parseQuestionProgressCount } from './question-progress';

describe('parseQuestionProgressCount', () => {
  it('returns the displayed total question count', () => {
    expect(parseQuestionProgressCount('Question 1 of 2')).toBe(2);
  });

  it('throws when the progress text does not match the expected format', () => {
    expect(() => parseQuestionProgressCount('Ready to begin')).toThrow(
      'Could not parse question progress count from "Ready to begin"',
    );
  });
});
