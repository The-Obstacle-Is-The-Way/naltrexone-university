import { describe, expect, it } from 'vitest';
import { summarizeSeedSync } from './seed-summary';

describe('summarizeSeedSync', () => {
  it('reports the counts and no failure when nothing was deferred', () => {
    expect(
      summarizeSeedSync(
        { inserted: 1, updated: 2, skipped: 3, deferred: [] },
        6,
      ),
    ).toEqual({
      summary:
        'Seed complete: inserted=1 updated=2 skipped=3 deferred=0 (files=6)',
      deferralFailure: null,
    });
  });

  it('names each deferred question and asks for a rerun once its sessions end', () => {
    const result = summarizeSeedSync(
      {
        inserted: 0,
        updated: 4,
        skipped: 0,
        deferred: [
          { slug: 'q-one', sessions: 1 },
          { slug: 'q-two', sessions: 3 },
        ],
      },
      6,
    );

    expect(result.summary).toBe(
      'Seed complete: inserted=0 updated=4 skipped=0 deferred=2 (files=6)',
    );
    expect(result.deferralFailure).toBe(
      'Seed deferred 2 questions because incomplete practice sessions bind their current revision: q-one (1 session), q-two (3 sessions). Every other question was applied. Rerun the seed after those sessions end.',
    );
  });
});
