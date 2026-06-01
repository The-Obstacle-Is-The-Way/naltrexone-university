import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { DrizzleQuestionFeedbackRepository } from '@/src/adapters/repositories/drizzle-question-feedback-repository';
import {
  newQuestionRatingFeedback,
  newQuestionReportFeedback,
} from '@/src/domain/entities';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
  createUser,
} from './helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

describe('DrizzleQuestionFeedbackRepository', () => {
  it('records rating and report events', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-feedback-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const repo = new DrizzleQuestionFeedbackRepository(db);

    await expect(
      repo.record(
        newQuestionRatingFeedback({
          userId: user.id,
          questionId: question.id,
          attemptId: null,
          practiceSessionId: null,
          rating: 'helpful',
        }),
      ),
    ).resolves.toMatchObject({
      userId: user.id,
      questionId: question.id,
      kind: 'rating',
      rating: 'helpful',
      category: null,
      comment: null,
    });

    await expect(
      repo.record(
        newQuestionReportFeedback({
          userId: user.id,
          questionId: question.id,
          attemptId: null,
          practiceSessionId: null,
          category: 'incorrect_answer',
          comment: 'The keyed answer appears wrong.',
        }),
      ),
    ).resolves.toMatchObject({
      userId: user.id,
      questionId: question.id,
      kind: 'report',
      rating: null,
      category: 'incorrect_answer',
      comment: 'The keyed answer appears wrong.',
    });
  });

  it('returns latest rating by createdAt and id descending while ignoring reports', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-feedback-latest-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const lowerId = '00000000-0000-4000-8000-000000000001';
    const higherId = 'ffffffff-ffff-4fff-bfff-ffffffffffff';
    const tieCreatedAt = new Date('2026-02-10T00:00:00.000Z');

    await db.insert(schema.questionFeedback).values([
      {
        id: lowerId,
        userId: user.id,
        questionId: question.id,
        kind: 'rating',
        rating: 'helpful',
        createdAt: tieCreatedAt,
      },
      {
        id: higherId,
        userId: user.id,
        questionId: question.id,
        kind: 'rating',
        rating: 'not_helpful',
        createdAt: tieCreatedAt,
      },
      {
        userId: user.id,
        questionId: question.id,
        kind: 'report',
        category: 'other',
        comment: 'Newer report should not affect rating hydration.',
        createdAt: new Date('2026-02-11T00:00:00.000Z'),
      },
    ]);

    const repo = new DrizzleQuestionFeedbackRepository(db);
    await expect(
      repo.findLatestRatingByUser(user.id, question.id),
    ).resolves.toMatchObject({
      id: higherId,
      rating: 'not_helpful',
    });
  });

  it('rejects invalid feedback shapes at the database boundary', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-feedback-check-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    await expect(
      db.insert(schema.questionFeedback).values({
        userId: user.id,
        questionId: question.id,
        kind: 'rating',
        rating: 'helpful',
        comment: 'Rating events cannot carry comments.',
      }),
    ).rejects.toMatchObject({ cause: { code: '23514' } });

    await expect(
      db.insert(schema.questionFeedback).values({
        userId: user.id,
        questionId: question.id,
        kind: 'report',
        rating: 'not_helpful',
        category: 'other',
      }),
    ).rejects.toMatchObject({ cause: { code: '23514' } });

    await expect(
      db.insert(schema.questionFeedback).values({
        userId: user.id,
        questionId: question.id,
        kind: 'report',
        category: null,
      }),
    ).rejects.toMatchObject({ cause: { code: '23514' } });

    await expect(
      db.insert(schema.questionFeedback).values({
        userId: user.id,
        questionId: question.id,
        kind: 'report',
        category: 'other',
        comment: 'x'.repeat(2001),
      }),
    ).rejects.toMatchObject({ cause: { code: '23514' } });

    const rows = await db
      .select({ id: schema.questionFeedback.id })
      .from(schema.questionFeedback)
      .where(eq(schema.questionFeedback.userId, user.id));
    expect(rows).toEqual([]);
  });
});
