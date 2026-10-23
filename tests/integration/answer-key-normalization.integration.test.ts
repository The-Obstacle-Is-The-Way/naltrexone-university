import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { choices, questionRevisions, questions } from '@/db/schema';
import type { QuestionRevisionFields } from '@/lib/content/question-revision-hash';
import {
  appendQuestionRevision,
  choiceIdByLabel,
} from '@/scripts/seed/question-revision-writer';
import { DrizzleAttemptRepository } from '@/src/adapters/repositories/drizzle-attempt-repository';
import { DrizzleQuestionRepository } from '@/src/adapters/repositories/drizzle-question-repository';
import {
  markdownNormalizationCases,
  significantMarkdownCases,
} from '@/src/domain/test-helpers/markdown-normalization-cases';
import { answeredOutcome } from '@/src/domain/value-objects';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
  createUser,
} from './helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();
afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});
afterAll(async () => {
  await closeConnection(sql);
});

function revisionFields(textMd: string): QuestionRevisionFields {
  return {
    stemMd: 'Synthetic stem',
    explanationMd: 'Synthetic explanation',
    referenceMd: null,
    difficulty: 'easy',
    choices: [
      {
        label: 'A',
        textMd: 'Synthetic distractor',
        isCorrect: false,
        explanationMd: null,
        sortOrder: 1,
      },
      {
        label: 'B',
        textMd,
        isCorrect: true,
        explanationMd: null,
        sortOrder: 2,
      },
    ],
  };
}

const cases = [
  ...markdownNormalizationCases.map((entry) => ({
    ...entry,
    corrected: false,
  })),
  ...significantMarkdownCases.map((entry) => ({ ...entry, corrected: true })),
];

describe('canonical answer keys on the production read paths', () => {
  it.each(cases)(
    '$name agrees between question reads and aggregate scores',
    {
      meta: {
        ruleProof: {
          file: 'tests/integration/answer-key-normalization.integration.test.ts',
          title: '$name agrees between question reads and aggregate scores',
        },
      },
    },
    async ({ raw, canonical, corrected }) => {
      const user = await createUser(db, cleanup);
      const question = await createQuestion(db, cleanup, {
        slug: `it-normalized-key-${randomUUID()}`,
        status: 'published',
        difficulty: 'easy',
      });
      const graded = await db.transaction(async (tx) => {
        await tx
          .select({ id: questions.id })
          .from(questions)
          .where(eq(questions.id, question.id))
          .for('update');
        const earlier = await appendQuestionRevision(
          tx,
          question.id,
          revisionFields(raw),
        );
        await new DrizzleAttemptRepository(tx).insert({
          userId: user.id,
          questionId: question.id,
          questionRevisionId: earlier.revisionId,
          practiceSessionId: null,
          outcome: answeredOutcome(choiceIdByLabel(earlier, 'B')),
          isCorrect: true,
          timeSpentSeconds: 10,
        });
        await appendQuestionRevision(
          tx,
          question.id,
          revisionFields(canonical),
        );
        return earlier;
      });
      const historicalRows = async () => ({
        revision: await db
          .select()
          .from(questionRevisions)
          .where(eq(questionRevisions.id, graded.revisionId)),
        choices: await db
          .select()
          .from(choices)
          .where(eq(choices.questionRevisionId, graded.revisionId)),
      });
      const before = await historicalRows();
      const [read] = await new DrizzleQuestionRepository(
        db,
      ).findByIdsForSession([
        { questionId: question.id, questionRevisionId: graded.revisionId },
      ]);
      const score = await new DrizzleAttemptRepository(db).scoreByUserId(
        user.id,
        null,
      );

      expect(read?.answerKeyChanged).toBe(corrected);
      expect(score).toEqual({
        scored: corrected ? 0 : 1,
        correct: corrected ? 0 : 1,
        unscoredQuestions: corrected ? 1 : 0,
      });
      expect(await historicalRows()).toEqual(before);
    },
  );
});
