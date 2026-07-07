import { describe, expect, it } from 'vitest';
import { shouldCommitChoiceSelection } from './choice-selection';

describe('shouldCommitChoiceSelection', () => {
  it('commits pointer and legacy unspecified selections', () => {
    expect(shouldCommitChoiceSelection('pointer')).toBe(true);
    expect(shouldCommitChoiceSelection(undefined)).toBe(true);
  });

  it('does not commit non-pointer radio selections', () => {
    expect(shouldCommitChoiceSelection('non-pointer')).toBe(false);
  });
});
