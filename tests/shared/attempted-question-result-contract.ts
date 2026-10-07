import { describe, expect, it } from 'vitest';
import type { AttemptedQuestionsFilters } from '@/src/application/ports/attempt-repository';
import type {
  AttemptScoreHarness,
  ScoredAttemptSeed,
} from './attempt-score-contract';

// ADR-022 Amendment 2026-10-05 (DEBT-498): History's Correct and Incorrect
// filters list neither a result no score counts nor one it does not, and its
// result sorts place such a result after every graded one. A result no score
// counts is a latest answer on a question withdrawn, under review or gone, or
// one graded on a key corrected since. This contract runs the same scenarios
// against FakeAttemptRepository and the Drizzle adapter on real Postgres, on
// the score contract's seeds, so the list and the score cannot disagree.

type Expected = {
  correct: readonly string[];
  incorrect: readonly string[];
  incorrectFirst: readonly string[];
  correctFirst: readonly string[];
};

type Scenario = {
  name: string;
  attempts: readonly ScoredAttemptSeed[];
  /** Question keys, most recent latest attempt first within each group. */
  expected: Expected;
};

const scenarios: readonly Scenario[] = [
  {
    name: 'lists a result no score counts under neither filter and sorts it last; retired and reworded questions keep their grades',
    attempts: [
      { question: 'a', now: 'available', outcome: 'correct', daysAgo: 1 },
      { question: 'b', now: 'available', outcome: 'incorrect', daysAgo: 2 },
      { question: 'r', now: 'retired', outcome: 'correct', daysAgo: 3 },
      { question: 'w', now: 'withdrawn', outcome: 'correct', daysAgo: 4 },
      { question: 'h', now: 'under_review', outcome: 'incorrect', daysAgo: 5 },
      {
        question: 'k',
        now: 'available',
        outcome: 'correct',
        daysAgo: 6,
        revisedAfter: 'key',
      },
      {
        question: 's',
        now: 'available',
        outcome: 'correct',
        daysAgo: 7,
        revisedAfter: 'stem',
      },
      {
        question: 'o',
        now: 'available',
        outcome: 'omitted',
        daysAgo: 8,
        revisedAfter: 'key',
      },
    ],
    expected: {
      correct: ['a', 'r', 's'],
      incorrect: ['b', 'o'],
      incorrectFirst: ['b', 'o', 'a', 'r', 's', 'w', 'h', 'k'],
      correctFirst: ['a', 'r', 's', 'b', 'o', 'w', 'h', 'k'],
    },
  },
  {
    name: 'grades by the latest attempt alone: an answer on a corrected key is not scored, an omission is',
    attempts: [
      {
        question: 'x',
        now: 'available',
        outcome: 'correct',
        daysAgo: 5,
        revisedAfter: 'key',
      },
      {
        question: 'x',
        now: 'available',
        outcome: 'incorrect',
        daysAgo: 1,
        revisedAfter: 'key',
      },
      {
        question: 'y',
        now: 'available',
        outcome: 'correct',
        daysAgo: 4,
        revisedAfter: 'key',
      },
      {
        question: 'y',
        now: 'available',
        outcome: 'omitted',
        daysAgo: 2,
        revisedAfter: 'key',
      },
    ],
    expected: {
      correct: [],
      incorrect: ['y'],
      incorrectFirst: ['y', 'x'],
      correctFirst: ['y', 'x'],
    },
  },
  {
    name: 'keeps the grade of an exam answer without a fair chance and of a question whose hold was lifted, since neither is doubt',
    attempts: [
      {
        question: 'e',
        now: 'available',
        outcome: 'correct',
        daysAgo: 1,
        inExam: true,
        removedBeforeEnd: true,
      },
      {
        question: 'l',
        now: 'retired',
        outcome: 'correct',
        daysAgo: 2,
        heldThenLifted: true,
      },
      { question: 'a', now: 'available', outcome: 'incorrect', daysAgo: 3 },
    ],
    expected: {
      correct: ['e', 'l'],
      incorrect: ['a'],
      incorrectFirst: ['a', 'e', 'l'],
      correctFirst: ['e', 'l', 'a'],
    },
  },
];

const queries: readonly {
  name: string;
  filters: AttemptedQuestionsFilters;
  pick: (expected: Expected) => readonly string[];
}[] = [
  {
    name: 'the Correct filter',
    filters: { result: 'correct' },
    pick: (expected) => expected.correct,
  },
  {
    name: 'the Incorrect filter',
    filters: { result: 'incorrect' },
    pick: (expected) => expected.incorrect,
  },
  {
    name: 'the Incorrect-first sort',
    filters: { sort: 'incorrect-first' },
    pick: (expected) => expected.incorrectFirst,
  },
  {
    name: 'the Correct-first sort',
    filters: { sort: 'correct-first' },
    pick: (expected) => expected.correctFirst,
  },
];

export function runAttemptedQuestionResultContract(
  adapterName: string,
  createHarness: () => Promise<AttemptScoreHarness>,
): void {
  describe(`${adapterName} attempted-question result contract`, () => {
    it.each(scenarios)('$name', async ({ attempts, expected }) => {
      const { repository, userId, questionIds } = await (
        await createHarness()
      ).seed(attempts);
      const keyById = new Map(
        [...questionIds].map(([key, questionId]) => [questionId, key]),
      );

      for (const { name, filters, pick } of queries) {
        const rows = await repository.listAttemptedQuestionsByUserId(
          userId,
          100,
          0,
          filters,
        );
        const count = await repository.countAttemptedQuestionsByUserId(
          userId,
          filters,
        );

        expect(
          rows.map((row) => keyById.get(row.questionId)),
          name,
        ).toEqual(pick(expected));
        expect(count, name).toBe(pick(expected).length);
      }
    });
  });
}
