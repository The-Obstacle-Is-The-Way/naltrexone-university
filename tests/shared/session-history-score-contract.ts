import { describe, expect, it } from 'vitest';
import type { PracticeSessionRepository } from '@/src/application/ports/repositories';

// DEBT-493 / ADR-022 Amendment (DEBT-494): a completed session's history score
// counts an item when the learner had a fair chance at it, recorded when the
// session ended, and its content is not now in doubt (withdrawn or under
// review). Retirement changes no score. This contract runs the same scenarios
// against FakePracticeSessionRepository and the Drizzle adapter on real
// Postgres.

export type QuestionStateNow =
  | 'available'
  | 'retired'
  | 'withdrawn'
  | 'under_review';

export type HistoryScoreItem = {
  answer: 'correct' | 'incorrect' | 'unanswered';
  /** The question's state when history is read. */
  now: QuestionStateNow;
  /** The question left the bank before the session ended. */
  removedBeforeEnd?: boolean;
};

export type SessionHistoryScoreHarness = {
  /** Ends one session over these items, in order, for a new learner. */
  seed(input: {
    mode: 'tutor' | 'exam';
    items: readonly HistoryScoreItem[];
  }): Promise<{
    repository: Pick<
      PracticeSessionRepository,
      'findCompletedHistorySummariesByUserId'
    >;
    userId: string;
  }>;
};

type Scenario = {
  name: string;
  mode: 'tutor' | 'exam';
  items: readonly HistoryScoreItem[];
  expected: { answered: number; scored: number; scoredCorrect: number };
};

const scenarios: readonly Scenario[] = [
  {
    name: 'scores every item when every question is available',
    mode: 'tutor',
    items: [
      { answer: 'correct', now: 'available' },
      { answer: 'incorrect', now: 'available' },
      { answer: 'unanswered', now: 'available' },
    ],
    expected: { answered: 2, scored: 3, scoredCorrect: 1 },
  },
  {
    name: 'keeps a question retired since counted, and leaves out a withdrawn or held one, answered or not',
    mode: 'tutor',
    items: [
      { answer: 'correct', now: 'retired' },
      { answer: 'incorrect', now: 'available' },
      { answer: 'correct', now: 'withdrawn' },
      { answer: 'unanswered', now: 'under_review' },
    ],
    expected: { answered: 3, scored: 2, scoredCorrect: 1 },
  },
  {
    name: 'leaves out an exam item whose question left the bank before the end, even once it returns',
    mode: 'exam',
    items: [
      { answer: 'correct', now: 'available', removedBeforeEnd: true },
      { answer: 'correct', now: 'available' },
      { answer: 'unanswered', now: 'available' },
    ],
    expected: { answered: 2, scored: 2, scoredCorrect: 1 },
  },
  {
    name: 'keeps a tutor answer given before its question left the bank, but not an item never answered',
    mode: 'tutor',
    items: [
      { answer: 'correct', now: 'retired', removedBeforeEnd: true },
      { answer: 'unanswered', now: 'retired', removedBeforeEnd: true },
    ],
    expected: { answered: 1, scored: 1, scoredCorrect: 1 },
  },
];

export function runSessionHistoryScoreContract(
  adapterName: string,
  createHarness: () => Promise<SessionHistoryScoreHarness>,
): void {
  describe(`${adapterName} session history score contract`, () => {
    it.each(scenarios)('$name', async ({ mode, items, expected }) => {
      const { repository, userId } = await (await createHarness()).seed({
        mode,
        items,
      });

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
