import { describe, expect, it } from 'vitest';
import {
  computeAccuracy,
  computeStreak,
  filterAttemptsInWindow,
} from './statistics';

describe('computeAccuracy', () => {
  it('returns 0 for no attempts', () => {
    expect(computeAccuracy(0, 0)).toBe(0);
  });

  it('returns 1 for all correct', () => {
    expect(computeAccuracy(10, 10)).toBe(1);
  });

  it('returns 0 for all incorrect', () => {
    expect(computeAccuracy(10, 0)).toBe(0);
  });

  it('calculates ratio correctly', () => {
    expect(computeAccuracy(4, 3)).toBeCloseTo(0.75);
  });
});

describe('computeStreak', () => {
  const today = new Date('2026-01-31T12:00:00Z');

  it('returns 0 for no attempts', () => {
    expect(computeStreak([], today)).toBe(0);
  });

  it('returns 1 for attempt only today', () => {
    const dates = [new Date('2026-01-31T10:00:00Z')];
    expect(computeStreak(dates, today)).toBe(1);
  });

  it('counts consecutive days', () => {
    const dates = [
      new Date('2026-01-31T10:00:00Z'),
      new Date('2026-01-30T10:00:00Z'),
      new Date('2026-01-29T10:00:00Z'),
    ];
    expect(computeStreak(dates, today)).toBe(3);
  });

  it('breaks on gap', () => {
    const dates = [
      new Date('2026-01-31T10:00:00Z'),
      new Date('2026-01-30T10:00:00Z'),
      // Gap: 2026-01-29 missing
      new Date('2026-01-28T10:00:00Z'),
    ];
    expect(computeStreak(dates, today)).toBe(2);
  });

  it('returns 0 if no attempt today', () => {
    const dates = [new Date('2026-01-30T10:00:00Z')];
    expect(computeStreak(dates, today)).toBe(0);
  });
});

describe('filterAttemptsInWindow', () => {
  const now = new Date('2026-01-31T12:00:00Z');

  it('filters attempts within the window', () => {
    const attempts = [
      { answeredAt: new Date('2026-01-31T00:00:00Z'), id: 'a1' },
      { answeredAt: new Date('2026-01-30T00:00:00Z'), id: 'a2' },
      { answeredAt: new Date('2026-01-20T00:00:00Z'), id: 'a3' },
    ];

    const result = filterAttemptsInWindow(attempts, 7, now);
    expect(result.map((a) => a.id)).toEqual(['a1', 'a2']);
  });

  it('returns empty for non-positive day window', () => {
    const attempts = [{ answeredAt: new Date('2026-01-31T00:00:00Z') }];
    expect(filterAttemptsInWindow(attempts, 0, now)).toEqual([]);
    expect(filterAttemptsInWindow(attempts, -1, now)).toEqual([]);
  });
});
