import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../db/schema';

export type WithdrawalRecord = { reason: string; authority: string };

type UnrecordedWithdrawal = {
  questionId: string;
  questionRevisionId: string;
};

// DEBT-483 / ADR-021 decision 5: withdrawal is per question (#953), so every
// revision of a withdrawn question is recorded. These are the revisions of the
// given questions that have no record yet; a recorded revision keeps its first
// record. The caller holds the questions' row locks, as the seed and the
// withdrawal command do, so no other writer records them meanwhile.
export async function findUnrecordedWithdrawals(
  tx: PostgresJsDatabase<typeof schema>,
  questionIds: readonly string[],
): Promise<UnrecordedWithdrawal[]> {
  return tx
    .select({
      questionId: schema.questionRevisions.questionId,
      questionRevisionId: schema.questionRevisions.id,
    })
    .from(schema.questionRevisions)
    .leftJoin(
      schema.questionWithdrawals,
      and(
        eq(
          schema.questionWithdrawals.questionId,
          schema.questionRevisions.questionId,
        ),
        eq(
          schema.questionWithdrawals.questionRevisionId,
          schema.questionRevisions.id,
        ),
      ),
    )
    .where(
      and(
        inArray(schema.questionRevisions.questionId, [...questionIds]),
        isNull(schema.questionWithdrawals.questionRevisionId),
      ),
    );
}

export async function recordWithdrawals(
  tx: PostgresJsDatabase<typeof schema>,
  unrecorded: readonly UnrecordedWithdrawal[],
  record: WithdrawalRecord,
): Promise<void> {
  if (unrecorded.length === 0) return;
  await tx
    .insert(schema.questionWithdrawals)
    .values(unrecorded.map((revision) => ({ ...revision, ...record })));
}

export async function isQuestionWithdrawn(
  tx: PostgresJsDatabase<typeof schema>,
  questionId: string,
): Promise<boolean> {
  const [row] = await tx
    .select({ questionId: schema.questionWithdrawals.questionId })
    .from(schema.questionWithdrawals)
    .where(eq(schema.questionWithdrawals.questionId, questionId))
    .limit(1);
  return row !== undefined;
}
