import { describe, expect, it } from 'vitest';
import migrationJournal from '@/db/migrations/meta/_journal.json';

describe('Drizzle migration journal ordering', () => {
  it('keeps migration timestamps unique and strictly increasing by idx', () => {
    const entriesByIdx = [...migrationJournal.entries].sort(
      (left, right) => left.idx - right.idx,
    );
    const timestamps = entriesByIdx.map((entry) => entry.when);
    const indexes = entriesByIdx.map((entry) => entry.idx);

    expect(new Set(timestamps).size).toBe(timestamps.length);
    expect(new Set(indexes).size).toBe(indexes.length);

    for (let index = 1; index < entriesByIdx.length; index += 1) {
      const previous = entriesByIdx[index - 1];
      const current = entriesByIdx[index];

      expect(current?.when, `journal idx ${current?.idx}`).toBeGreaterThan(
        previous?.when ?? Number.NEGATIVE_INFINITY,
      );
    }
  });
});
