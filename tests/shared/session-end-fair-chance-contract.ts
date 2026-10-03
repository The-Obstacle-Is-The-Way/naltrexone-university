import { describe, expect, it } from 'vitest';
import type { PracticeSessionRepository } from '@/src/application/ports/repositories';

// DEBT-494 / ADR-022 Amendment: whether the learner had a fair chance at each
// session item is recorded when the session ends: its question was available
// then, or, in tutor mode, the learner had already answered it. This contract
// runs the same scenarios against FakePracticeSessionRepository and the
// Drizzle adapter on real Postgres.

export type FairChanceItem = {
  /** Whether the item's question is still published when the session ends. */
  published: boolean;
  answered: boolean;
};

export type SessionEndFairChanceHarness = {
  /** One active session over these items, in order, for a new learner. */
  seed(input: {
    mode: 'tutor' | 'exam';
    items: readonly FairChanceItem[];
  }): Promise<{
    repository: Pick<PracticeSessionRepository, 'end' | 'findByIdAndUserId'>;
    sessionId: string;
    userId: string;
  }>;
};

type Scenario = {
  name: string;
  mode: 'tutor' | 'exam';
  items: readonly FairChanceItem[];
  expected: readonly boolean[];
};

const scenarios: readonly Scenario[] = [
  {
    name: 'tutor: an item whose question left the bank keeps its fair chance only if answered',
    mode: 'tutor',
    items: [
      { published: true, answered: false },
      { published: false, answered: true },
      { published: false, answered: false },
    ],
    expected: [true, true, false],
  },
  {
    name: 'exam: only an item whose question is published at the end had a fair chance, answered or not',
    mode: 'exam',
    items: [
      { published: true, answered: true },
      { published: true, answered: false },
      { published: false, answered: true },
      { published: false, answered: false },
    ],
    expected: [true, true, false, false],
  },
];

export function runSessionEndFairChanceContract(
  adapterName: string,
  createHarness: () => Promise<SessionEndFairChanceHarness>,
): void {
  describe(`${adapterName} session end fair-chance contract`, () => {
    it.each(scenarios)('$name', async ({ mode, items, expected }) => {
      const { repository, sessionId, userId } = await (
        await createHarness()
      ).seed({ mode, items });

      const before = await repository.findByIdAndUserId(sessionId, userId);
      const ended = await repository.end(sessionId, userId);
      const after = await repository.findByIdAndUserId(sessionId, userId);

      // Nothing is recorded while the session is active.
      expect(
        before?.questionStates.map((state) => state.fairChanceAtEnd),
      ).toEqual(items.map(() => null));
      expect(
        ended.questionStates.map((state) => state.fairChanceAtEnd),
      ).toEqual(expected);
      expect(
        after?.questionStates.map((state) => state.fairChanceAtEnd),
      ).toEqual(expected);
    });
  });
}
