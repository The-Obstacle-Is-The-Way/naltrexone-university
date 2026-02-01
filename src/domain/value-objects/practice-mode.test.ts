import { describe, expect, it } from 'vitest';
import {
  AllPracticeModes,
  isValidPracticeMode,
  shouldShowExplanation,
} from './practice-mode';

describe('PracticeMode', () => {
  it('has tutor and exam modes', () => {
    expect(AllPracticeModes).toEqual(['tutor', 'exam']);
  });

  it('validates known modes', () => {
    expect(isValidPracticeMode('tutor')).toBe(true);
    expect(isValidPracticeMode('exam')).toBe(true);
  });

  it('rejects unknown modes', () => {
    expect(isValidPracticeMode('quiz')).toBe(false);
  });

  describe('shouldShowExplanation', () => {
    it('returns true for tutor mode', () => {
      expect(shouldShowExplanation('tutor', false)).toBe(true);
    });

    it('returns false for exam mode when not ended', () => {
      expect(shouldShowExplanation('exam', false)).toBe(false);
    });

    it('returns true for exam mode when ended', () => {
      expect(shouldShowExplanation('exam', true)).toBe(true);
    });
  });
});
