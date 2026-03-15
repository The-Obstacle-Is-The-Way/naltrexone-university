import { describe, expect, it } from 'vitest';
import { normalizeSearchParam } from '@/lib/search-params';

describe('lib/search-params', () => {
  it('returns the same string when input is a string', () => {
    expect(normalizeSearchParam('session_id')).toBe('session_id');
  });

  it('returns the first value when input is a string array', () => {
    expect(normalizeSearchParam(['cs_a', 'cs_b'])).toBe('cs_a');
  });

  it('returns undefined when input is missing', () => {
    expect(normalizeSearchParam(undefined)).toBeUndefined();
  });

  it('returns an empty string when input is an empty string', () => {
    expect(normalizeSearchParam('')).toBe('');
  });
});
