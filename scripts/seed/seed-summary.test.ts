import { describe, expect, it } from 'vitest';
import { summarizeSeedSync } from './seed-summary';

describe('summarizeSeedSync', () => {
  it('reports each outcome and how many updates appended a revision (ADR-021)', () => {
    expect(
      summarizeSeedSync({ inserted: 1, updated: 2, revised: 1, skipped: 3 }, 6),
    ).toBe(
      'Seed complete: inserted=1 updated=2 (new revisions=1) skipped=3 (files=6)',
    );
  });
});
