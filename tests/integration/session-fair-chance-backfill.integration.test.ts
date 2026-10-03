import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
  createUser,
} from './helpers';
import { readDebt494FairChanceBackfillSql } from './marked-migration-sql-test-helpers';
import { setQuestionState } from './question-state-test-helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();
const sessions = new DrizzlePracticeSessionRepository(db);

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

async function fairChanceOf(sessionId: string) {
  const rows = await db
    .select({
      questionId: schema.practiceSessionQuestionStates.questionId,
      fairChanceAtEnd: schema.practiceSessionQuestionStates.fairChanceAtEnd,
    })
    .from(schema.practiceSessionQuestionStates)
    .where(
      eq(schema.practiceSessionQuestionStates.practiceSessionId, sessionId),
    );
  return new Map(rows.map((row) => [row.questionId, row.fairChanceAtEnd]));
}

// DEBT-494: a session that ended before migration 0050 is recorded once, by
// the migration, from the bank as it stands then.
describe('DEBT-494: the fair-chance backfill (migration 0050)', () => {
  it('records each ended item from the bank as it stands, once, and leaves active and recorded items alone', async () => {
    const user = await createUser(db, cleanup);
    const [available, retired, recordedFalse] = await Promise.all(
      ['available', 'retired', 'recorded'].map((label) =>
        createQuestion(db, cleanup, {
          slug: `it-fair-chance-backfill-${label}-${randomUUID()}`,
          status: 'published',
          difficulty: 'easy',
        }),
      ),
    );
    if (!available || !retired || !recordedFalse) throw new Error('questions');
    const start = (mode: 'tutor' | 'exam', questionIds: string[]) =>
      sessions.create({
        userId: user.id,
        mode,
        paramsJson: {
          count: questionIds.length,
          tagSlugs: [],
          difficulties: [],
          questionIds,
        },
      });
    const tutor = await start('tutor', [available.id, retired.id]);
    await sessions.recordQuestionAnswer({
      sessionId: tutor.id,
      userId: user.id,
      questionId: retired.id,
      selectedChoiceId: retired.correctChoiceId,
      isCorrect: true,
      answeredAt: new Date(),
    });
    await sessions.end(tutor.id, user.id);
    const exam = await start('exam', [available.id, retired.id]);
    await sessions.end(exam.id, user.id);
    const recorded = await start('exam', [recordedFalse.id]);
    await setQuestionState(db, recordedFalse, 'retired');
    await sessions.end(recorded.id, user.id);
    await setQuestionState(db, recordedFalse, 'available');
    const active = await start('tutor', [available.id, retired.id]);
    // As a session ended before 0050 left it.
    await db
      .update(schema.practiceSessionQuestionStates)
      .set({ fairChanceAtEnd: null })
      .where(
        inArray(schema.practiceSessionQuestionStates.practiceSessionId, [
          tutor.id,
          exam.id,
        ]),
      );
    await setQuestionState(db, retired, 'retired');

    const backfill = readDebt494FairChanceBackfillSql();
    await sql.unsafe(backfill);
    await sql.unsafe(backfill);

    // A tutor answer keeps its fair chance; an exam item on a question
    // unpublished by then has none.
    expect(await fairChanceOf(tutor.id)).toEqual(
      new Map([
        [available.id, true],
        [retired.id, true],
      ]),
    );
    expect(await fairChanceOf(exam.id)).toEqual(
      new Map([
        [available.id, true],
        [retired.id, false],
      ]),
    );
    // A recorded item keeps its record, though its question is back.
    expect(await fairChanceOf(recorded.id)).toEqual(
      new Map([[recordedFalse.id, false]]),
    );
    // An active session is recorded when it ends.
    expect(await fairChanceOf(active.id)).toEqual(
      new Map([
        [available.id, null],
        [retired.id, null],
      ]),
    );
  });
});
