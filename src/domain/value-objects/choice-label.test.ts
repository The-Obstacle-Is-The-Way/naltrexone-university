import { describe, expect, it } from 'vitest';
import { AllChoiceLabels, isValidChoiceLabel } from './choice-label';

describe('ChoiceLabel', () => {
  it('contains exactly A through E', () => {
    expect(AllChoiceLabels).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('validates known labels', () => {
    for (const label of AllChoiceLabels) {
      expect(isValidChoiceLabel(label)).toBe(true);
    }
  });

  it('rejects unknown labels', () => {
    expect(isValidChoiceLabel('F')).toBe(false);
    expect(isValidChoiceLabel('a')).toBe(false);
  });
});
