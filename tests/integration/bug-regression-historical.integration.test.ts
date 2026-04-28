import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
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

// ---------------------------------------------------------------------------
// BUG-188: CAS comparison works with legacy params_json (no questionStates)
// ---------------------------------------------------------------------------

describe('BUG-188: CAS works with legacy JSON shapes', () => {
  it('succeeds CAS on legacy params_json without questionStates key', async () => {
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

    const sessionRepo = new DrizzlePracticeSessionRepository(db);

    // CAS must succeed on first try despite legacy shape
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

    // Verify the row is upgraded to include questionStates
    const updatedRow = await db.query.practiceSessions.findFirst({
      where: eq(schema.practiceSessions.id, row.id),
    });
    expect(updatedRow?.paramsJson).toHaveProperty('questionStates');
  });

  it('succeeds CAS on current-format params_json with questionStates', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-current-cas-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    // Use the normal create path which produces current-format JSON
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

    // CAS must succeed on current-format shape
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
  });

  it('succeeds CAS for setQuestionMarkedForReview with legacy params_json', async () => {
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

    const sessionRepo = new DrizzlePracticeSessionRepository(db);

    // setQuestionMarkedForReview should also work with legacy shape
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
