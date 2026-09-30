import { eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../db/schema';
import { sha256Hex } from '../../lib/content/parse-mdx-question';
import {
  QUESTION_REVISION_CANONICALIZATION,
  type QuestionRevisionFields,
  questionRevisionContentHash,
} from '../../lib/content/question-revision-hash';
import { onlyRow } from './only-row';

export type AppendedQuestionRevision = {
  revisionId: string;
  revisionNumber: number;
  /** The new revision's choice ids, by label. */
  choiceIdsByLabel: ReadonlyMap<string, string>;
};

// ADR-021 phase 2b: content is appended, never updated. The new revision gets
// the next number and its own choice rows, the question's current revision
// moves to it, and the question's legacy text columns keep mirroring the
// current revision until the contract phase drops them. The caller holds the
// question row lock, so revision numbers cannot race.
export async function appendQuestionRevision(
  tx: PostgresJsDatabase<typeof schema>,
  questionId: string,
  fields: QuestionRevisionFields,
  updatedAt: Date = new Date(),
): Promise<AppendedQuestionRevision> {
  const [latest] = await tx
    .select({
      revisionNumber: sql<number>`coalesce(max(${schema.questionRevisions.revisionNumber}), 0)::int`,
    })
    .from(schema.questionRevisions)
    .where(eq(schema.questionRevisions.questionId, questionId));
  const revisionNumber = (latest?.revisionNumber ?? 0) + 1;

  const revision = onlyRow(
    await tx
      .insert(schema.questionRevisions)
      .values({
        questionId,
        revisionNumber,
        stemMd: fields.stemMd,
        explanationMd: fields.explanationMd,
        referenceMd: fields.referenceMd,
        difficulty: fields.difficulty,
        canonicalizationVersion: QUESTION_REVISION_CANONICALIZATION,
        contentHash: questionRevisionContentHash(fields, { hash: sha256Hex }),
      })
      .returning({ id: schema.questionRevisions.id }),
    `Failed to append a revision to question ${questionId}`,
  );

  const choices = await tx
    .insert(schema.choices)
    .values(
      fields.choices.map((choice) => ({
        questionId,
        questionRevisionId: revision.id,
        label: choice.label,
        textMd: choice.textMd,
        isCorrect: choice.isCorrect,
        explanationMd: choice.explanationMd,
        sortOrder: choice.sortOrder,
      })),
    )
    .returning({ id: schema.choices.id, label: schema.choices.label });

  await tx
    .update(schema.questions)
    .set({
      currentRevisionId: revision.id,
      stemMd: fields.stemMd,
      explanationMd: fields.explanationMd,
      referenceMd: fields.referenceMd,
      difficulty: fields.difficulty,
      updatedAt,
    })
    .where(eq(schema.questions.id, questionId));

  return {
    revisionId: revision.id,
    revisionNumber,
    choiceIdsByLabel: new Map(
      choices.map((choice) => [choice.label, choice.id]),
    ),
  };
}

// A new revision's choice id by label, for callers that know its labels.
export function choiceIdByLabel(
  appended: AppendedQuestionRevision,
  label: string,
): string {
  const id = appended.choiceIdsByLabel.get(label);
  if (id === undefined) {
    throw new Error(
      `Revision ${appended.revisionNumber} has no choice ${label}`,
    );
  }
  return id;
}
