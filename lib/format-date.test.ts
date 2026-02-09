import { describe, expect, it } from 'vitest';

import { formatDate } from './format-date';

describe('formatDate', () => {
  it('formats ISO date strings in UTC', () => {
    expect(formatDate('2026-02-01T00:00:00.000Z')).toBe('Feb 1, 2026');
  });

  it('returns an empty string for invalid dates', () => {
    expect(formatDate('not a date')).toBe('');
  });
});
