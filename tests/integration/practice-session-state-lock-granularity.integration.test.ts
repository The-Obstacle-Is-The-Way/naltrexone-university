import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
  createUser,
} from './helpers';

const { db, sql } = createIntegrationDb();
const blocker = createIntegrationDb();
const cleanup = createCleanupState();

const PARENT_LOCK_PROBE_MS = 250;

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(blocker.sql);
  await closeConnection(sql);
});

describe('practice-session state lock granularity', () => {
  it('does not block a different question state write behind a parent session row lock', async () => {
    const user = await createUser(db, cleanup);
    const firstQuestion = await createQuestion(db, cleanup, {
      slug: `lock-granularity-a-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const secondQuestion = await createQuestion(db, cleanup, {
      slug: `lock-granularity-b-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const repo = new DrizzlePracticeSessionRepository(
      db,
      () => new Date('2026-07-03T12:00:00.000Z'),
    );
    const session = await repo.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 2,
        tagSlugs: [],
        difficulties: [],
        questionIds: [firstQuestion.id, secondQuestion.id],
      },
    });
    const lockReady = createDeferred<void>();
    const releaseLock = createDeferred<void>();
    const parentLock = blocker.sql.begin(async (tx) => {
      await tx`
        select 1
        from practice_sessions
        where id = ${session.id}
        for update
      `;
      lockReady.resolve();
      await releaseLock.promise;
    });

    await lockReady.promise;

    const write = repo.saveDraftAnswer({
      sessionId: session.id,
      userId: user.id,
      questionId: secondQuestion.id,
      selectedChoiceId: secondQuestion.correctChoiceId,
      cumulativeMs: 12_000,
    });
    let raceResult:
      | { status: 'resolved'; state: Awaited<typeof write> }
      | { status: 'rejected'; reason: unknown }
      | { status: 'blocked' };
    try {
      raceResult = await Promise.race([
        write.then(
          (state) => ({ status: 'resolved' as const, state }),
          (reason: unknown) => ({ status: 'rejected' as const, reason }),
        ),
        sleep(PARENT_LOCK_PROBE_MS).then(() => ({
          status: 'blocked' as const,
        })),
      ]);
    } finally {
      releaseLock.resolve();
      await Promise.allSettled([parentLock, write]);
    }

    expect(raceResult).toMatchObject({
      status: 'resolved',
      state: {
        questionId: secondQuestion.id,
        draftSelectedChoiceId: secondQuestion.correctChoiceId,
      },
    });
  });

  it('keeps same-question concurrent writes cleanly bounded to success or ApplicationError CONFLICT', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `same-row-conflict-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const repo = new DrizzlePracticeSessionRepository(
      db,
      () => new Date('2026-07-03T12:05:00.000Z'),
    );
    const session = await repo.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });
    await db
      .update(schema.practiceSessionQuestionStates)
      .set({
        version: drizzleSql`${schema.practiceSessionQuestionStates.version} + 1`,
      })
      .where(
        and(
          eq(
            schema.practiceSessionQuestionStates.practiceSessionId,
            session.id,
          ),
          eq(schema.practiceSessionQuestionStates.questionId, question.id),
        ),
      );

    const results = await Promise.allSettled([
      repo.saveDraftAnswer({
        sessionId: session.id,
        userId: user.id,
        questionId: question.id,
        selectedChoiceId: question.correctChoiceId,
        cumulativeMs: 20_000,
      }),
      repo.saveDraftAnswer({
        sessionId: session.id,
        userId: user.id,
        questionId: question.id,
        selectedChoiceId: question.incorrectChoiceId,
        cumulativeMs: 25_000,
      }),
    ]);

    for (const result of results) {
      if (result.status === 'fulfilled') {
        expect(result.value.questionId).toBe(question.id);
      } else {
        expect(result.reason).toMatchObject({
          code: 'CONFLICT',
          message: 'Practice session state changed concurrently; please retry.',
        });
      }
    }
  });
});
