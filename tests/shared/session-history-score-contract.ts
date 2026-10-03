import { describe, expect, it } from 'vitest';
import type { PracticeSessionRepository } from '@/src/application/ports/repositories';

// DEBT-493 / ADR-022 Decision 3: a completed session's history score counts
// only the items whose question is available, read at the time of the read.
// This contract runs the same scenarios against FakePracticeSessionRepository
// and the Drizzle adapter on real Postgres.

export type HistoryScoreItem = {
  answer: 'correct' | 'incorrect' | 'unanswered';
  /** Whether the question is still published when history is read. */
  published: boolean;
};

export type SessionHistoryScoreHarness = {
  /** Ends one session over these items, in order, for a new learner. */
  seed(items: readonly HistoryScoreItem[]): Promise<{
    repository: Pick<
      PracticeSessionRepository,
      'findCompletedHistorySummariesByUserId'
    >;
    userId: string;
  }>;
};

type Scenario = {
  name: string;
  items: readonly HistoryScoreItem[];
  expected: { answered: number; scored: number; scoredCorrect: number };
};

const scenarios: readonly Scenario[] = [
  {
    name: 'scores every item when every question is published',
    items: [
      { answer: 'correct', published: true },
      { answer: 'incorrect', published: true },
      { answer: 'unanswered', published: true },
    ],
    expected: { answered: 2, scored: 3, scoredCorrect: 1 },
  },
  {
    name: 'leaves an unpublished item out of both counts, answered or not, and keeps it answered',
    items: [
      { answer: 'correct', published: false },
      { answer: 'correct', published: true },
      { answer: 'incorrect', published: true },
      { answer: 'unanswered', published: false },
    ],
    expected: { answered: 3, scored: 2, scoredCorrect: 1 },
  },
  {
    name: 'scores nothing when no question is published',
    items: [
      { answer: 'correct', published: false },
      { answer: 'unanswered', published: false },
    ],
    expected: { answered: 1, scored: 0, scoredCorrect: 0 },
  },
];

export function runSessionHistoryScoreContract(
  adapterName: string,
  createHarness: () => Promise<SessionHistoryScoreHarness>,
): void {
  describe(`${adapterName} session history score contract`, () => {
    it.each(scenarios)('$name', async ({ items, expected }) => {
      const { repository, userId } = await (await createHarness()).seed(items);

      const page = await repository.findCompletedHistorySummariesByUserId(
        userId,
        10,
        0,
        null,
      );

      expect(page.rows).toHaveLength(1);
      expect(page.rows[0]).toMatchObject({
        questionCount: items.length,
        ...expected,
      });
    });
  });
}
