import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { attempts } from '@/db/schema';
import { latestAttemptRankSql } from '@/src/adapters/repositories/shared/latest-attempt-rank-sql';
import {
  cleanup,
  createQuestion,
  createUser,
  db,
  insertAttemptAt,
} from './bug-regression-test-helpers';

describe('latestAttemptRankSql (Postgres)', () => {
  it('ranks each question by newest answeredAt, then by id among ties', async () => {
    const user = await createUser(db, cleanup);
    const firstQuestion = await createQuestion(db, cleanup, {
      slug: `it-latest-attempt-rank-first-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const secondQuestion = await createQuestion(db, cleanup, {
      slug: `it-latest-attempt-rank-second-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const olderAt = new Date('2026-09-01T12:00:00.000Z');
    const newerAt = new Date('2026-09-01T13:00:00.000Z');
    for (const [question, answeredAt] of [
      [firstQuestion, olderAt],
      [firstQuestion, newerAt],
      [firstQuestion, newerAt],
      [secondQuestion, olderAt],
    ] as const) {
      await insertAttemptAt({
        userId: user.id,
        questionId: question.id,
        practiceSessionId: null,
        selectedChoiceId: question.correctChoiceId,
        answeredAt,
      });
    }

    const rows = await db
      .select({
        id: attempts.id,
        questionId: attempts.questionId,
        answeredAt: attempts.answeredAt,
        rank: latestAttemptRankSql({
          questionId: attempts.questionId,
          answeredAt: attempts.answeredAt,
          id: attempts.id,
        }),
      })
      .from(attempts)
      .where(eq(attempts.userId, user.id));

    const firstQuestionRows = rows.filter(
      (row) => row.questionId === firstQuestion.id,
    );
    // Postgres orders uuid values bytewise, which matches the lowercase
    // canonical text order, so the larger id wins the tie.
    const tiedIdsDescending = firstQuestionRows
      .filter((row) => row.answeredAt.getTime() === newerAt.getTime())
      .map((row) => row.id)
      .sort()
      .reverse();
    const rankById = new Map(rows.map((row) => [row.id, Number(row.rank)]));

    expect(tiedIdsDescending.map((id) => rankById.get(id))).toEqual([1, 2]);
    expect(
      firstQuestionRows
        .filter((row) => row.answeredAt.getTime() === olderAt.getTime())
        .map((row) => rankById.get(row.id)),
    ).toEqual([3]);
    expect(
      rows
        .filter((row) => row.questionId === secondQuestion.id)
        .map((row) => rankById.get(row.id)),
    ).toEqual([1]);
  });
});
