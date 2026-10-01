import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import {
  addCurrentRevision,
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
} from './helpers';
import { readDebt483WithdrawalBackfillSql } from './marked-migration-sql-test-helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

// A question with two revisions, written directly as the code before
// migration 0045 left it: an archive recorded no withdrawal.
async function arrangeQuestion(
  status: schema.QuestionStatus,
  slug = `it-withdrawal-${randomUUID()}`,
) {
  const question = await createQuestion(db, cleanup, {
    slug,
    status,
    difficulty: 'easy',
  });
  const second = await addCurrentRevision(db, question.id);
  return {
    id: question.id,
    revisionIds: [question.revisionId, second.revisionId],
  };
}

async function withdrawalsOf(questionIds: string[]) {
  return db
    .select()
    .from(schema.questionWithdrawals)
    .where(inArray(schema.questionWithdrawals.questionId, questionIds));
}

describe('DEBT-483: the withdrawal overlay (migration 0045)', () => {
  it('backfills every revision of each archived question once, and no other question', async () => {
    const archived = await arrangeQuestion('archived');
    const published = await arrangeQuestion('published');
    const draft = await arrangeQuestion('draft');
    const placeholder = await arrangeQuestion(
      'archived',
      `placeholder-${randomUUID()}`,
    );
    const backfill = readDebt483WithdrawalBackfillSql();

    await sql.unsafe(backfill);
    await sql.unsafe(backfill);

    const rows = await withdrawalsOf([
      archived.id,
      published.id,
      draft.id,
      placeholder.id,
    ]);
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining(
        archived.revisionIds.map((questionRevisionId) => ({
          questionId: archived.id,
          questionRevisionId,
          reason: 'archived before withdrawals were recorded',
          authority: 'migration 0045',
          effectiveAt: expect.any(Date),
        })),
      ),
    );
  });

  it("rejects a withdrawal naming another question's revision", async () => {
    const first = await arrangeQuestion('published');
    const second = await arrangeQuestion('published');

    await expect(
      sql`
        INSERT INTO question_withdrawals
          (question_id, question_revision_id, reason, authority)
        VALUES (${first.id}, ${second.revisionIds[0] ?? ''}, 'Unsafe', 'Owner')
      `,
    ).rejects.toMatchObject({
      constraint_name: schema.QUESTION_WITHDRAWALS_QUESTION_REVISION_FK,
    });
  });

  it.each([
    ['reason', ' ', 'Owner', 'question_withdrawals_reason_chk'],
    ['authority', 'Unsafe', '\t', 'question_withdrawals_authority_chk'],
  ])('rejects a blank %s', async (_field, reason, authority, constraint) => {
    const question = await arrangeQuestion('published');

    await expect(
      sql`
          INSERT INTO question_withdrawals
            (question_id, question_revision_id, reason, authority)
          VALUES (${question.id}, ${question.revisionIds[0] ?? ''}, ${reason}, ${authority})
        `,
    ).rejects.toMatchObject({ constraint_name: constraint });
  });
});
