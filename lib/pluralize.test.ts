import { describe, expect, it } from 'vitest';
import { pluralize } from './pluralize';

describe('pluralize', () => {
  it('uses the plural form for zero', () => {
    expect(pluralize(0, 'question')).toBe('0 questions');
  });

  it('uses the singular form for exactly one', () => {
    expect(pluralize(1, 'question')).toBe('1 question');
  });

  it('uses the default "+s" plural for counts greater than one', () => {
    expect(pluralize(2, 'question')).toBe('2 questions');
    expect(pluralize(20, 'question')).toBe('20 questions');
  });

  it('uses an explicit custom plural when provided', () => {
    expect(pluralize(1, 'match', 'matches')).toBe('1 match');
    expect(pluralize(3, 'match', 'matches')).toBe('3 matches');
  });
});
