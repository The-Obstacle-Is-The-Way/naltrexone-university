import { randomUUID } from 'node:crypto';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
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
import {
  readDebt483WithdrawalBackfillRepairSql,
  readDebt483WithdrawalBackfillSql,
} from './marked-migration-sql-test-helpers';

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

// A committed synthetic fixture, archived for the test. The fixture rows
// exist when this database was seeded with placeholders; otherwise the test
// creates one. Either way the database is left as it was: restore() removes
// only withdrawals the test added and keeps any recorded before it.
async function archiveFixture(slug: string) {
  const [existing] = await db
    .select({
      id: schema.questions.id,
      status: schema.questions.status,
      updatedAt: schema.questions.updatedAt,
    })
    .from(schema.questions)
    .where(eq(schema.questions.slug, slug));
  if (!existing) {
    const created = await arrangeQuestion('archived', slug);
    return { id: created.id, restore: async () => {} };
  }
  const recordedBefore = (await withdrawalsOf([existing.id])).map(
    (row) => row.questionRevisionId,
  );
  await db
    .update(schema.questions)
    .set({ status: 'archived' })
    .where(eq(schema.questions.id, existing.id));
  return {
    id: existing.id,
    restore: async () => {
      await db
        .delete(schema.questionWithdrawals)
        .where(
          and(
            eq(schema.questionWithdrawals.questionId, existing.id),
            notInArray(
              schema.questionWithdrawals.questionRevisionId,
              recordedBefore,
            ),
          ),
        );
      await db
        .update(schema.questions)
        .set({ status: existing.status, updatedAt: existing.updatedAt })
        .where(eq(schema.questions.id, existing.id));
    },
  };
}

async function withdrawalsOf(questionIds: string[]) {
  return db
    .select()
    .from(schema.questionWithdrawals)
    .where(inArray(schema.questionWithdrawals.questionId, questionIds));
}

describe('DEBT-483: the withdrawal overlay (migration 0045)', () => {
  // 0045 shipped to Preview excluding every placeholder- slug; 0046 repairs
  // it (#1290 review). They run here in migration order.
  it('backfills every revision of each archived question once, and no other question', async () => {
    const archived = await arrangeQuestion('archived');
    // The prefix alone does not make a question synthetic (#1290 review).
    const prefixed = await arrangeQuestion(
      'archived',
      `placeholder-${randomUUID()}`,
    );
    const published = await arrangeQuestion('published');
    const draft = await arrangeQuestion('draft');
    const fixture = await archiveFixture('placeholder-01-naltrexone-mechanism');
    const backfill = readDebt483WithdrawalBackfillSql();
    const repair = readDebt483WithdrawalBackfillRepairSql();

    try {
      for (const run of [backfill, repair, backfill, repair]) {
        await sql.unsafe(run);
      }

      const rows = await withdrawalsOf([
        archived.id,
        prefixed.id,
        published.id,
        draft.id,
        fixture.id,
      ]);
      expect(rows).toHaveLength(4);
      expect(rows).toEqual(
        expect.arrayContaining(
          (
            [
              [archived, 'migration 0045'],
              [prefixed, 'migration 0046'],
            ] as const
          ).flatMap(([question, authority]) =>
            question.revisionIds.map((questionRevisionId) => ({
              questionId: question.id,
              questionRevisionId,
              reason: 'archived before withdrawals were recorded',
              authority,
              effectiveAt: expect.any(Date),
            })),
          ),
        ),
      );
    } finally {
      await fixture.restore();
    }
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
