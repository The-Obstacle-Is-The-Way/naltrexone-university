import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { readQuestionFeedbackRows } from '@/scripts/export-question-feedback';
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

describe('readQuestionFeedbackRows', () => {
  it('projects stored rating and report fields with their own question slugs', async () => {
    const user = await createUser(db, cleanup);
    const ratingQuestion = await createQuestion(db, cleanup, {
      slug: `it-export-rating-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const reportQuestion = await createQuestion(db, cleanup, {
      slug: `it-export-report-${randomUUID()}`,
      status: 'draft',
      difficulty: 'medium',
    });
    const [session] = await db
      .insert(schema.practiceSessions)
      .values({
        userId: user.id,
        mode: 'tutor',
        paramsJson: {
          count: 1,
          tagSlugs: [],
          difficulties: [],
          questionIds: [reportQuestion.id],
        },
      })
      .returning({ id: schema.practiceSessions.id });
    if (!session) throw new Error('Failed to insert practice session');
    const [attempt] = await db
      .insert(schema.attempts)
      .values({
        userId: user.id,
        questionId: reportQuestion.id,
        practiceSessionId: session.id,
        isOmitted: true,
        isCorrect: false,
      })
      .returning({ id: schema.attempts.id });
    if (!attempt) throw new Error('Failed to insert attempt');

    const rating = {
      id: randomUUID(),
      userId: user.id,
      questionId: ratingQuestion.id,
      attemptId: null,
      practiceSessionId: null,
      kind: 'rating',
      rating: 'helpful',
      category: null,
      comment: null,
      createdAt: new Date('2000-01-01T00:00:00Z'),
    } satisfies schema.NewQuestionFeedback;
    const report = {
      id: randomUUID(),
      userId: user.id,
      questionId: reportQuestion.id,
      attemptId: attempt.id,
      practiceSessionId: session.id,
      kind: 'report',
      rating: null,
      category: 'ambiguous_wording',
      comment: 'Integration export fixture',
      createdAt: new Date('2000-01-02T00:00:00Z'),
    } satisfies schema.NewQuestionFeedback;
    await db.insert(schema.questionFeedback).values([rating, report]);

    const rows = (await readQuestionFeedbackRows(db)).filter(
      (row) => row.userId === user.id,
    );

    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        { ...rating, questionSlug: ratingQuestion.slug },
        { ...report, questionSlug: reportQuestion.slug },
      ]),
    );
  });

  it('orders by newest timestamp before descending id ties, not insertion order', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-export-order-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const [lowId, middleId, highId] = [
      randomUUID(),
      randomUUID(),
      randomUUID(),
    ].sort();
    if (!lowId || !middleId || !highId) {
      throw new Error('Expected three feedback IDs');
    }
    const base = {
      userId: user.id,
      questionId: question.id,
      kind: 'rating',
      rating: 'helpful',
    } satisfies schema.NewQuestionFeedback;
    const newest = new Date('2000-01-02T00:00:00Z');
    // The largest ID is oldest; insertion order disagrees with the tie-breaker.
    await db.insert(schema.questionFeedback).values([
      { ...base, id: highId, createdAt: new Date('2000-01-01T00:00:00Z') },
      { ...base, id: lowId, createdAt: newest },
      { ...base, id: middleId, createdAt: newest },
    ]);

    const rows = (await readQuestionFeedbackRows(db)).filter(
      (row) => row.userId === user.id,
    );

    expect(rows.map((row) => row.id)).toEqual([middleId, lowId, highId]);
  });
});
