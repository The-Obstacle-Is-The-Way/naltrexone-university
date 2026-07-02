import { randomUUID } from 'node:crypto';
import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { PracticeSessionParams } from '@/db/schema';
import * as schema from '@/db/schema';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import {
  cleanup,
  createQuestion,
  createUser,
  db,
} from './bug-regression-test-helpers';
import { readDebt425BackfillSql } from './practice-session-state-backfill-helper';

// ---------------------------------------------------------------------------
// BUG-188: legacy params_json rows remain updatable after Track A backfill.
// ---------------------------------------------------------------------------

describe('BUG-188: legacy JSON shapes migrate to relational state', () => {
  it('updates a migrated legacy params_json row without questionStates key', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-legacy-cas-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    // Insert session with legacy JSON shape (no questionStates key)
    const legacyParamsJson: PracticeSessionParams = {
      count: 1,
      tagSlugs: [],
      difficulties: [],
      questionIds: [question.id],
    };

    const [row] = await db
      .insert(schema.practiceSessions)
      .values({
        userId: user.id,
        mode: 'tutor',
        paramsJson: legacyParamsJson,
      })
      .returning({ id: schema.practiceSessions.id });

    if (!row) throw new Error('Failed to insert legacy session');

    await db.execute(drizzleSql.raw(readDebt425BackfillSql()));

    const sessionRepo = new DrizzlePracticeSessionRepository(db);

    await expect(
      sessionRepo.recordQuestionAnswer({
        sessionId: row.id,
        userId: user.id,
        questionId: question.id,
        selectedChoiceId: question.correctChoiceId,
        isCorrect: true,
        answeredAt: new Date(),
      }),
    ).resolves.toMatchObject({
      questionId: question.id,
      latestIsCorrect: true,
    });

    const [updatedState] = await db
      .select({
        latestSelectedChoiceId:
          schema.practiceSessionQuestionStates.latestSelectedChoiceId,
        latestIsCorrect: schema.practiceSessionQuestionStates.latestIsCorrect,
      })
      .from(schema.practiceSessionQuestionStates)
      .where(
        and(
          eq(schema.practiceSessionQuestionStates.practiceSessionId, row.id),
          eq(schema.practiceSessionQuestionStates.questionId, question.id),
        ),
      );
    expect(updatedState).toEqual({
      latestSelectedChoiceId: question.correctChoiceId,
      latestIsCorrect: true,
    });

    const storedSession = await db.query.practiceSessions.findFirst({
      where: eq(schema.practiceSessions.id, row.id),
    });
    expect(storedSession?.paramsJson).not.toHaveProperty('questionStates');
  });

  it('updates current-format params_json with relational state rows', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-current-cas-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const session = await sessionRepo.create({
      userId: user.id,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });

    await expect(
      sessionRepo.recordQuestionAnswer({
        sessionId: session.id,
        userId: user.id,
        questionId: question.id,
        selectedChoiceId: question.correctChoiceId,
        isCorrect: true,
        answeredAt: new Date(),
      }),
    ).resolves.toMatchObject({
      questionId: question.id,
      latestIsCorrect: true,
    });

    const storedSession = await db.query.practiceSessions.findFirst({
      where: eq(schema.practiceSessions.id, session.id),
    });
    expect(storedSession?.paramsJson).not.toHaveProperty('questionStates');
  });

  it('updates review marks for a migrated legacy params_json row', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-legacy-mark-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    // Insert session with legacy JSON shape
    const legacyParamsJson: PracticeSessionParams = {
      count: 1,
      tagSlugs: [],
      difficulties: [],
      questionIds: [question.id],
    };

    const [row] = await db
      .insert(schema.practiceSessions)
      .values({
        userId: user.id,
        mode: 'exam',
        paramsJson: legacyParamsJson,
      })
      .returning({ id: schema.practiceSessions.id });

    if (!row) throw new Error('Failed to insert legacy session');

    await db.execute(drizzleSql.raw(readDebt425BackfillSql()));

    const sessionRepo = new DrizzlePracticeSessionRepository(db);

    await expect(
      sessionRepo.setQuestionMarkedForReview({
        sessionId: row.id,
        userId: user.id,
        questionId: question.id,
        markedForReview: true,
      }),
    ).resolves.toMatchObject({
      questionId: question.id,
      markedForReview: true,
    });
  });
});
