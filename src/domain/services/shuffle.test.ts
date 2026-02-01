import { describe, expect, it } from 'vitest';
import { createSeed, shuffleWithSeed } from './shuffle';

describe('shuffleWithSeed', () => {
  it('is deterministic for same seed', () => {
    const items = [1, 2, 3, 4, 5];
    const result1 = shuffleWithSeed(items, 12345);
    const result2 = shuffleWithSeed(items, 12345);
    expect(result1).toEqual(result2);
  });

  it('differs for different seeds', () => {
    const items = [1, 2, 3, 4, 5];
    const result1 = shuffleWithSeed(items, 111);
    const result2 = shuffleWithSeed(items, 222);
    expect(result1).not.toEqual(result2);
  });

  it('contains all original items', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const result = shuffleWithSeed(items, 999);
    expect(new Set(result)).toEqual(new Set(items));
  });

  it('handles empty array', () => {
    expect(shuffleWithSeed([], 123)).toEqual([]);
  });
});

describe('createSeed', () => {
  it('is deterministic for same inputs', () => {
    expect(createSeed('user-1', 123)).toBe(createSeed('user-1', 123));
  });

  it('differs for different inputs', () => {
    expect(createSeed('user-1', 123)).not.toBe(createSeed('user-2', 123));
    expect(createSeed('user-1', 123)).not.toBe(createSeed('user-1', 456));
  });

  it('never returns a negative number for int32 MIN_VALUE hash', () => {
    const userId = String.fromCharCode(22728, 4, 16, 30);
    expect(createSeed(userId, 0)).toBe(2_147_483_648);
  });
});
