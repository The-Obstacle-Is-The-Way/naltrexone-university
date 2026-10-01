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

// ADR-021: content is appended, never updated. The new revision gets the next
// number and its own choice rows, and the question's current revision moves to
// it. The caller holds the question row lock, so revision numbers cannot race.
// A new question is written pointing at its first revision's id, given here,
// before that revision exists; the deferred key is checked at commit. Staging
// a release (DEBT-483) passes makeCurrent: false, so the revision stays
// invisible until an activation moves the pointer to it.
export async function appendQuestionRevision(
  tx: PostgresJsDatabase<typeof schema>,
  questionId: string,
  fields: QuestionRevisionFields,
  options: {
    revisionId?: string;
    updatedAt?: Date;
    makeCurrent?: boolean;
  } = {},
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
        ...(options.revisionId ? { id: options.revisionId } : {}),
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

  if (options.makeCurrent ?? true) {
    await tx
      .update(schema.questions)
      .set({
        currentRevisionId: revision.id,
        updatedAt: options.updatedAt ?? new Date(),
      })
      .where(eq(schema.questions.id, questionId));
  }

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
