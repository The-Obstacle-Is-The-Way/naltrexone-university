import { describe, expect, it } from 'vitest';
import { AllPracticeModes, shouldShowExplanation } from './practice-mode';

describe('PracticeMode', () => {
  it('has tutor and exam modes', () => {
    expect(AllPracticeModes).toEqual(['tutor', 'exam']);
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
