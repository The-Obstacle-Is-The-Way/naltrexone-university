import { describe, expect, it } from 'vitest';
import type { QuestionRepository } from '@/src/application/ports/repositories';
import type {
  QuestionAvailability,
  QuestionStatus,
} from '@/src/domain/value-objects';

// DEBT-493 / ADR-022 Decision 1: a question's availability is derived at read
// time from its status, its withdrawals and its unlifted holds. This contract
// runs the same scenarios against FakeQuestionRepository and the Drizzle
// adapter on real Postgres.

/** The overlay rows to seed, as the overlay tables hold them. */
export type QuestionAvailabilitySeed = {
  status: QuestionStatus;
  /** A withdrawal row on the question's current revision. */
  withdrawn?: boolean;
  /** Holds, each on the current or the earlier revision. */
  holds?: readonly { revision: 'current' | 'earlier'; lifted: boolean }[];
};

/** A question with two revisions, the second current, seeded as asked. */
export type SeededQuestion = {
  repository: Pick<
    QuestionRepository,
    'findByIdsForSession' | 'findAvailabilityByIds'
  >;
  questionId: string;
  currentRevisionId: string;
  earlierRevisionId: string;
};

export type QuestionAvailabilityContractHarness = {
  seed(input: QuestionAvailabilitySeed): Promise<SeededQuestion>;
};

type ContractScenario = {
  name: string;
  seed: QuestionAvailabilitySeed;
  expected: QuestionAvailability;
};

const questionAvailabilityContractScenarios: readonly ContractScenario[] = [
  {
    name: 'a published question is available',
    seed: { status: 'published' },
    expected: 'available',
  },
  {
    name: 'a published question stays available whatever its overlay',
    seed: {
      status: 'published',
      withdrawn: true,
      holds: [{ revision: 'earlier', lifted: false }],
    },
    expected: 'available',
  },
  {
    name: 'an archived question with a withdrawal is withdrawn',
    seed: { status: 'archived', withdrawn: true },
    expected: 'withdrawn',
  },
  {
    name: 'a withdrawal wins over an unlifted hold',
    seed: {
      status: 'archived',
      withdrawn: true,
      holds: [{ revision: 'current', lifted: false }],
    },
    expected: 'withdrawn',
  },
  {
    name: 'an unlifted hold on the current revision puts it under review',
    seed: {
      status: 'archived',
      holds: [{ revision: 'current', lifted: false }],
    },
    expected: 'under_review',
  },
  {
    name: 'an unlifted hold on an earlier revision puts it under review',
    seed: {
      status: 'archived',
      holds: [{ revision: 'earlier', lifted: false }],
    },
    expected: 'under_review',
  },
  {
    name: 'a lifted hold alone leaves it retired',
    seed: {
      status: 'archived',
      holds: [{ revision: 'current', lifted: true }],
    },
    expected: 'retired',
  },
  {
    name: 'an archived question with no overlay is retired',
    seed: { status: 'archived' },
    expected: 'retired',
  },
  {
    name: 'a draft question with no overlay is retired',
    seed: { status: 'draft' },
    expected: 'retired',
  },
];

export function runQuestionAvailabilityContract(
  adapterName: string,
  createHarness: () => Promise<QuestionAvailabilityContractHarness>,
): void {
  describe(`${adapterName} question availability contract`, () => {
    it.each(questionAvailabilityContractScenarios)(
      '$name, read through either revision',
      async ({ seed, expected }) => {
        const harness = await createHarness();
        const seeded = await harness.seed(seed);

        const read = await seeded.repository.findByIdsForSession([
          {
            questionId: seeded.questionId,
            questionRevisionId: seeded.currentRevisionId,
          },
          {
            questionId: seeded.questionId,
            questionRevisionId: seeded.earlierRevisionId,
          },
        ]);

        expect(
          read.map(({ revisionId, availability }) => ({
            revisionId,
            availability,
          })),
        ).toEqual([
          { revisionId: seeded.currentRevisionId, availability: expected },
          { revisionId: seeded.earlierRevisionId, availability: expected },
        ]);
      },
    );

    // A bookmark binds no revision, so it reads availability by question
    // (DEBT-493 increment 5).
    it.each(questionAvailabilityContractScenarios)(
      '$name, read by id',
      async ({ seed, expected }) => {
        const harness = await createHarness();
        const seeded = await harness.seed(seed);

        const read = await seeded.repository.findAvailabilityByIds([
          seeded.questionId,
        ]);

        expect([...read]).toEqual([[seeded.questionId, expected]]);
      },
    );

    it('leaves out an id with no question', async () => {
      const harness = await createHarness();
      const seeded = await harness.seed({ status: 'published' });
      const missingId = crypto.randomUUID();

      const read = await seeded.repository.findAvailabilityByIds([
        missingId,
        seeded.questionId,
      ]);

      expect([...read]).toEqual([[seeded.questionId, 'available']]);
    });
  });
}
