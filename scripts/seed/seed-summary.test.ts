import { describe, expect, it } from 'vitest';
import {
  summarizePlaceholderArchival,
  summarizeSeedSync,
} from './seed-summary';

describe('summarizeSeedSync', () => {
  it('reports each outcome and how many updates appended a revision (ADR-021)', () => {
    expect(
      summarizeSeedSync({ inserted: 1, updated: 2, revised: 1, skipped: 3 }, 6),
    ).toBe(
      'Seed complete: inserted=1 updated=2 (new revisions=1) skipped=3 (files=6)',
    );
  });
});

describe('summarizePlaceholderArchival', () => {
  it('names the committed fixtures, not a slug prefix (BUG-315)', () => {
    expect(summarizePlaceholderArchival(3)).toBe(
      'Archived placeholders: 3 (the ten committed fixture QIDs)',
    );
  });
});
