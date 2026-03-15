import { describe, expect, it } from 'vitest';
import { normalizeSearchParam } from './search-params';

describe('lib/search-params', () => {
  it('returns string inputs unchanged', () => {
    expect(normalizeSearchParam('session_id')).toBe('session_id');
  });

  it('returns the first value for array inputs', () => {
    expect(normalizeSearchParam(['cs_a', 'cs_b'])).toBe('cs_a');
  });

  it('returns undefined when the input is missing', () => {
    expect(normalizeSearchParam(undefined)).toBeUndefined();
  });

  it('preserves empty string inputs', () => {
    expect(normalizeSearchParam('')).toBe('');
  });
});
