import { randomUUID } from 'node:crypto';
import { sql as drizzleSql, eq } from 'drizzle-orm';
import { afterAll, afterEach } from 'vitest';
import * as schema from '@/db/schema';
import { DrizzleQuestionRepository } from '@/src/adapters/repositories/drizzle-question-repository';
import { runQuestionAvailabilityContract } from '@/tests/shared/question-availability-contract';
import {
  addCurrentRevision,
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
} from './helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

const DECISION = { reason: 'Contract test', authority: 'Test suite' };

runQuestionAvailabilityContract('DrizzleQuestionRepository', async () => ({
  async seed(seed) {
    const question = await createQuestion(db, cleanup, {
      slug: `it-availability-${randomUUID()}`,
      status: seed.status,
      difficulty: 'easy',
    });
    const earlierRevisionId = question.revisionId;
    const { revisionId: currentRevisionId } = await addCurrentRevision(
      db,
      question.id,
    );
    const revisionIdOf = (revision: 'current' | 'earlier') =>
      revision === 'current' ? currentRevisionId : earlierRevisionId;

    if (seed.withdrawn) {
      await db.insert(schema.questionWithdrawals).values({
        questionId: question.id,
        questionRevisionId: currentRevisionId,
        ...DECISION,
      });
    }
    for (const hold of seed.holds ?? []) {
      const [placed] = await db
        .insert(schema.questionHolds)
        .values({
          questionId: question.id,
          questionRevisionId: revisionIdOf(hold.revision),
          ...DECISION,
        })
        .returning({ id: schema.questionHolds.id });
      if (hold.lifted && placed) {
        await db
          .update(schema.questionHolds)
          .set({
            // From the row, not the client clock: a client time has
            // millisecond precision, so within the same millisecond it sorts
            // before the database's microsecond placed_at, and the
            // lifted-after-placed check refuses it.
            liftedAt: drizzleSql`${schema.questionHolds.placedAt} + interval '1 second'`,
            liftReason: 'Contract test lift',
            liftAuthority: 'Test suite',
          })
          .where(eq(schema.questionHolds.id, placed.id));
      }
    }

    return {
      repository: new DrizzleQuestionRepository(db),
      questionId: question.id,
      currentRevisionId,
      earlierRevisionId,
    };
  },
}));
