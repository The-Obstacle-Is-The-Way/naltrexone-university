import { describe, expect, it } from 'vitest';
import type {
  AttemptAllQuestionsReader,
  AttemptStatsReader,
} from '@/src/application/ports/attempt-repository';

// DEBT-493 / ADR-022 Amendment (DEBT-494): dashboard accuracy counts an
// attempt when the learner had a fair chance at it and its question's content
// is not now in doubt (withdrawn or under review). Retirement changes no
// score. This contract runs the same scenarios against FakeAttemptRepository
// and the Drizzle adapter on real Postgres.

export type ScoredAttemptSeed = {
  /** Attempts with the same key are on the same question. */
  question: string;
  /** The question's state when the score is read. */
  now: 'available' | 'retired' | 'withdrawn' | 'under_review';
  outcome: 'correct' | 'incorrect' | 'omitted';
  /** When the attempt was answered, in days before `now`. */
  daysAgo: number;
  /** Answered in the learner's one exam, rather than outside a session. */
  inExam?: boolean;
  /**
   * The question left the bank before the exam ended, so the learner had no
   * fair chance at it.
   */
  removedBeforeEnd?: boolean;
  /** The question was held, and the hold lifted, before its state now. */
  heldThenLifted?: boolean;
  /**
   * After the attempts, the question gained a current revision: with another
   * correct choice (its key corrected), or with only its stem reworded.
   */
  revisedAfter?: 'key' | 'key text' | 'stem' | 'distractor';
};

/**
 * Seeds the scenarios for this contract and for History's result contract
 * (`attempted-question-result-contract.ts`), which reads the same seeds.
 */
export type AttemptScoreHarness = {
  seed(attempts: readonly ScoredAttemptSeed[]): Promise<{
    repository: Pick<AttemptStatsReader, 'scoreByUserId'> &
      Pick<
        AttemptAllQuestionsReader,
        'listAttemptedQuestionsByUserId' | 'countAttemptedQuestionsByUserId'
      >;
    userId: string;
    now: Date;
    /** Each seed's question key, to its question's id. */
    questionIds: ReadonlyMap<string, string>;
  }>;
};

type Scenario = {
  name: string;
  attempts: readonly ScoredAttemptSeed[];
  sinceDaysAgo: number | null;
  expected: { scored: number; correct: number; unscoredQuestions: number };
};

const scenarios: readonly Scenario[] = [
  {
    name: 'scores every attempt when every question is available',
    attempts: [
      { question: 'a', now: 'available', outcome: 'correct', daysAgo: 1 },
      { question: 'b', now: 'available', outcome: 'incorrect', daysAgo: 2 },
      { question: 'a', now: 'available', outcome: 'correct', daysAgo: 3 },
    ],
    sinceDaysAgo: null,
    expected: { scored: 3, correct: 2, unscoredQuestions: 0 },
  },
  {
    name: 'keeps a retired question counted, and leaves out the attempts on a withdrawn or held one, counted once',
    attempts: [
      { question: 'a', now: 'available', outcome: 'correct', daysAgo: 1 },
      { question: 'r', now: 'retired', outcome: 'correct', daysAgo: 1 },
      { question: 'w', now: 'withdrawn', outcome: 'correct', daysAgo: 1 },
      { question: 'w', now: 'withdrawn', outcome: 'incorrect', daysAgo: 2 },
      { question: 'h', now: 'under_review', outcome: 'incorrect', daysAgo: 2 },
    ],
    sinceDaysAgo: null,
    expected: { scored: 2, correct: 2, unscoredQuestions: 2 },
  },
  {
    name: 'scores an omitted attempt as incorrect',
    attempts: [
      { question: 'a', now: 'available', outcome: 'omitted', daysAgo: 1 },
      { question: 'b', now: 'available', outcome: 'correct', daysAgo: 1 },
    ],
    sinceDaysAgo: null,
    expected: { scored: 2, correct: 1, unscoredQuestions: 0 },
  },
  {
    name: 'counts only the attempts answered in the window',
    attempts: [
      { question: 'a', now: 'available', outcome: 'correct', daysAgo: 1 },
      { question: 'b', now: 'available', outcome: 'correct', daysAgo: 10 },
      { question: 'w', now: 'withdrawn', outcome: 'correct', daysAgo: 10 },
    ],
    sinceDaysAgo: 7,
    expected: { scored: 1, correct: 1, unscoredQuestions: 0 },
  },
  {
    name: 'leaves out an exam answer whose question left the bank before the exam ended, even once it returns',
    attempts: [
      {
        question: 'x',
        now: 'available',
        outcome: 'correct',
        daysAgo: 1,
        inExam: true,
        removedBeforeEnd: true,
      },
      {
        question: 'y',
        now: 'available',
        outcome: 'incorrect',
        daysAgo: 1,
        inExam: true,
      },
      { question: 'a', now: 'available', outcome: 'correct', daysAgo: 1 },
    ],
    sinceDaysAgo: null,
    expected: { scored: 2, correct: 1, unscoredQuestions: 1 },
  },
  {
    name: 'keeps a question counted whose hold was lifted before it was retired',
    attempts: [
      {
        question: 'l',
        now: 'retired',
        outcome: 'correct',
        daysAgo: 1,
        heldThenLifted: true,
      },
    ],
    sinceDaysAgo: null,
    expected: { scored: 1, correct: 1, unscoredQuestions: 0 },
  },
  {
    name: 'leaves out an answer whose key was corrected since, but keeps an omitted attempt and a reworded stem',
    attempts: [
      {
        question: 'k',
        now: 'available',
        outcome: 'correct',
        daysAgo: 1,
        revisedAfter: 'key',
      },
      {
        question: 'o',
        now: 'available',
        outcome: 'omitted',
        daysAgo: 1,
        revisedAfter: 'key',
      },
      {
        question: 's',
        now: 'available',
        outcome: 'correct',
        daysAgo: 1,
        revisedAfter: 'stem',
      },
    ],
    sinceDaysAgo: null,
    expected: { scored: 2, correct: 1, unscoredQuestions: 1 },
  },
  {
    name: "reads the key as the correct choices' text: rewording the correct choice corrects it, rewording a distractor does not",
    attempts: [
      {
        question: 't',
        now: 'available',
        outcome: 'correct',
        daysAgo: 1,
        revisedAfter: 'key text',
      },
      {
        question: 'd',
        now: 'available',
        outcome: 'correct',
        daysAgo: 1,
        revisedAfter: 'distractor',
      },
    ],
    sinceDaysAgo: null,
    expected: { scored: 1, correct: 1, unscoredQuestions: 1 },
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;

export function runAttemptScoreContract(
  adapterName: string,
  createHarness: () => Promise<AttemptScoreHarness>,
): void {
  describe(`${adapterName} attempt score contract`, () => {
    it.each(scenarios)(
      '$name',
      async ({ attempts, sinceDaysAgo, expected }) => {
        const { repository, userId, now } = await (await createHarness()).seed(
          attempts,
        );
        const since =
          sinceDaysAgo === null
            ? null
            : new Date(now.getTime() - sinceDaysAgo * DAY_MS);

        await expect(repository.scoreByUserId(userId, since)).resolves.toEqual(
          expected,
        );
      },
    );
  });
}
