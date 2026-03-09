import { describe, expect, it } from 'vitest';
import { parseQuestionProgressCount } from './question-progress';

describe('parseQuestionProgressCount', () => {
  it('returns the displayed total question count from plain progress text', () => {
    expect(parseQuestionProgressCount('Question 1 of 2')).toBe(2);
  });

  it('returns the displayed total from progress text with mode hint suffix', () => {
    expect(
      parseQuestionProgressCount(
        'Question 1 of 2 — Explanations shown after each answer.',
      ),
    ).toBe(2);
  });

  it('throws when the progress text does not match the expected format', () => {
    expect(() => parseQuestionProgressCount('Ready to begin')).toThrow(
      'Could not parse question progress count from "Ready to begin"',
    );
  });
});
