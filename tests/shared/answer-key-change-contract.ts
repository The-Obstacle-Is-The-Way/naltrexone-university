import { describe, expect, it } from 'vitest';
import type { QuestionRepository } from '@/src/application/ports/repositories';

// DEBT-493 increment 4 / ADR-022 Decision 4: a question read at a revision
// says whether its answer key differs from the current revision's. This
// contract runs the same scenarios against FakeQuestionRepository and the
// Drizzle adapter on real Postgres.

/** How the current revision changed from the earlier one. */
export type RevisionChange = 'correct choice' | 'stem only';

export type AnswerKeyChangeHarness = {
  /** A question with two revisions, the second current, changed as asked. */
  seed(change: RevisionChange): Promise<{
    repository: Pick<QuestionRepository, 'findByIdsForSession'>;
    questionId: string;
    currentRevisionId: string;
    earlierRevisionId: string;
  }>;
};

const scenarios: readonly {
  name: string;
  change: RevisionChange;
  read: 'current' | 'earlier';
  expected: boolean;
}[] = [
  {
    name: 'the current revision has the current key',
    change: 'correct choice',
    read: 'current',
    expected: false,
  },
  {
    name: 'an earlier revision whose correct choice differs has a changed key',
    change: 'correct choice',
    read: 'earlier',
    expected: true,
  },
  {
    name: 'an earlier revision that differs only in its stem keeps the key',
    change: 'stem only',
    read: 'earlier',
    expected: false,
  },
];

export function runAnswerKeyChangeContract(
  adapterName: string,
  createHarness: () => Promise<AnswerKeyChangeHarness>,
): void {
  describe(`${adapterName} answer key change contract`, () => {
    it.each(scenarios)('$name', async ({ change, read, expected }) => {
      const seeded = await (await createHarness()).seed(change);

      const [question] = await seeded.repository.findByIdsForSession([
        {
          questionId: seeded.questionId,
          questionRevisionId:
            read === 'current'
              ? seeded.currentRevisionId
              : seeded.earlierRevisionId,
        },
      ]);

      expect(question?.answerKeyChanged).toBe(expected);
    });
  });
}
