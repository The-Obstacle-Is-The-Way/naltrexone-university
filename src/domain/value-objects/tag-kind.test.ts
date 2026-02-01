import { describe, expect, it } from 'vitest';
import { AllTagKinds, isValidTagKind } from './tag-kind';

describe('TagKind', () => {
  it('contains the canonical set of kinds', () => {
    expect(AllTagKinds).toEqual([
      'domain',
      'topic',
      'substance',
      'treatment',
      'diagnosis',
    ]);
  });

  it('validates known kinds', () => {
    for (const kind of AllTagKinds) {
      expect(isValidTagKind(kind)).toBe(true);
    }
  });

  it('rejects unknown kinds', () => {
    expect(isValidTagKind('system')).toBe(false);
  });
});
