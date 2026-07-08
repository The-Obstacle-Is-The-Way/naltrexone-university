import { describe, expect, it } from 'vitest';
import { shouldCommitChoiceSelection } from './choice-selection';

describe('shouldCommitChoiceSelection', () => {
  it('commits only pointer-originated selections', () => {
    expect(shouldCommitChoiceSelection('pointer')).toBe(true);
  });

  it('does not commit non-pointer radio selections', () => {
    expect(shouldCommitChoiceSelection('non-pointer')).toBe(false);
  });

  it('rejects an omitted origin at the type level so a forgotten argument cannot silently commit', () => {
    // @ts-expect-error -- origin is required; undefined must not be accepted
    const result = shouldCommitChoiceSelection(undefined);
    expect(result).toBe(false);
  });
});
