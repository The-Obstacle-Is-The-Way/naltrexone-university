import { describe, expect, it } from 'vitest';
import { AllDifficulties, isValidDifficulty } from './question-difficulty';

describe('QuestionDifficulty', () => {
  it('has exactly 3 levels', () => {
    expect(AllDifficulties).toEqual(['easy', 'medium', 'hard']);
  });

  it('validates known difficulties', () => {
    expect(isValidDifficulty('easy')).toBe(true);
    expect(isValidDifficulty('medium')).toBe(true);
    expect(isValidDifficulty('hard')).toBe(true);
  });

  it('rejects unknown difficulties', () => {
    expect(isValidDifficulty('extreme')).toBe(false);
  });
});
