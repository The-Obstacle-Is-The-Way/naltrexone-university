import { describe, expect, it } from 'vitest';
import { onlyRow } from './only-row';

describe('onlyRow', () => {
  it('returns the first row a write or lock returned', () => {
    expect(onlyRow([{ id: 'q1' }], 'Failed to insert question')).toEqual({
      id: 'q1',
    });
  });

  it('fails with the given message when there is none', () => {
    expect(() => onlyRow([], 'Failed to insert question')).toThrow(
      'Failed to insert question',
    );
  });
});
