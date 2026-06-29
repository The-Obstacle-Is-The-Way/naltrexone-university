import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
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
const backfillSql = readFileSync(
  resolve(
    __dirname,
    '../../db/migrations/0018_backfill-omitted-exam-attempts.sql',
  ),
  'utf8',
);

type LegacyPracticeSessionParams = schema.PracticeSessionParams & {
  questionStates: Array<{
    questionId: string;
    markedForReview: boolean;
    latestSelectedChoiceId: string | null;
    latestIsCorrect: boolean | null;
    latestAnsweredAt: string | null;
    draftSelectedChoiceId: string | null;
    draftSavedAt: string | null;
    draftCumulativeMs: number;
  }>;
};

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

describe('omitted exam attempt backfill migration', () => {
  it('inserts omitted incorrect attempts for ended exam terminal-null states idempotently', async () => {
    const user = await createUser(db, cleanup);
    const qOmitted = await createQuestion(db, cleanup, {
      slug: `it-backfill-omitted-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const qExistingAttempt = await createQuestion(db, cleanup, {
      slug: `it-backfill-existing-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const qAnsweredState = await createQuestion(db, cleanup, {
      slug: `it-backfill-answered-state-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const qActiveExam = await createQuestion(db, cleanup, {
      slug: `it-backfill-active-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const qTutor = await createQuestion(db, cleanup, {
      slug: `it-backfill-tutor-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const endedAt = new Date('2026-05-01T12:00:00.000Z');
    const examParamsJson: LegacyPracticeSessionParams = {
      count: 3,
      tagSlugs: [],
      difficulties: [],
      questionIds: [qOmitted.id, qExistingAttempt.id, qAnsweredState.id],
      questionStates: [
        {
          questionId: qOmitted.id,
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: null,
          draftSavedAt: null,
          draftCumulativeMs: 12_500,
        },
        {
          questionId: qExistingAttempt.id,
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: null,
          draftSavedAt: null,
          draftCumulativeMs: 8_000,
        },
        {
          questionId: qAnsweredState.id,
          markedForReview: false,
          latestSelectedChoiceId: qAnsweredState.correctChoiceId,
          latestIsCorrect: true,
          latestAnsweredAt: endedAt.toISOString(),
          draftSelectedChoiceId: null,
          draftSavedAt: null,
          draftCumulativeMs: 5_000,
        },
      ],
    };
    const activeExamParamsJson: LegacyPracticeSessionParams = {
      count: 1,
      tagSlugs: [],
      difficulties: [],
      questionIds: [qActiveExam.id],
      questionStates: [
        {
          questionId: qActiveExam.id,
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: null,
          draftSavedAt: null,
          draftCumulativeMs: 4_000,
        },
      ],
    };
    const tutorParamsJson: LegacyPracticeSessionParams = {
      count: 1,
      tagSlugs: [],
      difficulties: [],
      questionIds: [qTutor.id],
      questionStates: [
        {
          questionId: qTutor.id,
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: null,
          draftSavedAt: null,
          draftCumulativeMs: 4_000,
        },
      ],
    };

    const [examSession] = await db
      .insert(schema.practiceSessions)
      .values({
        userId: user.id,
        mode: 'exam',
        endedAt,
        paramsJson: examParamsJson,
      })
      .returning({ id: schema.practiceSessions.id });
    if (!examSession) throw new Error('Failed to insert exam session');

    await db.insert(schema.practiceSessions).values([
      {
        userId: user.id,
        mode: 'exam',
        endedAt: null,
        paramsJson: activeExamParamsJson,
      },
      {
        userId: user.id,
        mode: 'tutor',
        endedAt,
        paramsJson: tutorParamsJson,
      },
    ]);

    await db.insert(schema.attempts).values({
      userId: user.id,
      questionId: qExistingAttempt.id,
      practiceSessionId: examSession.id,
      selectedChoiceId: qExistingAttempt.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
      answeredAt: endedAt,
    });

    await sql.unsafe(backfillSql);
    const afterFirstRun = await db
      .select()
      .from(schema.attempts)
      .where(eq(schema.attempts.userId, user.id));

    expect(afterFirstRun).toHaveLength(2);
    expect(afterFirstRun).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          questionId: qOmitted.id,
          practiceSessionId: examSession.id,
          selectedChoiceId: null,
          isOmitted: true,
          isCorrect: false,
          timeSpentSeconds: 12,
          answeredAt: endedAt,
        }),
        expect.objectContaining({
          questionId: qExistingAttempt.id,
          practiceSessionId: examSession.id,
          selectedChoiceId: qExistingAttempt.correctChoiceId,
          isOmitted: false,
          isCorrect: true,
        }),
      ]),
    );
    expect(afterFirstRun.map((attempt) => attempt.questionId)).not.toContain(
      qAnsweredState.id,
    );
    expect(afterFirstRun.map((attempt) => attempt.questionId)).not.toContain(
      qActiveExam.id,
    );
    expect(afterFirstRun.map((attempt) => attempt.questionId)).not.toContain(
      qTutor.id,
    );

    await sql.unsafe(backfillSql);
    const afterSecondRun = await db
      .select()
      .from(schema.attempts)
      .where(eq(schema.attempts.userId, user.id));

    expect(afterSecondRun.map((attempt) => attempt.id).sort()).toEqual(
      afterFirstRun.map((attempt) => attempt.id).sort(),
    );
  });
});
