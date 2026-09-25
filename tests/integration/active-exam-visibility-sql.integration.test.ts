import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { attempts, practiceSessions } from '@/db/schema';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import { getActiveExamVisibilityCondition } from '@/src/adapters/repositories/shared/active-exam-visibility';
import {
  cleanup,
  createQuestion,
  createUser,
  db,
  insertAttemptAt,
} from './bug-regression-test-helpers';

describe('getActiveExamVisibilityCondition (Postgres)', () => {
  it('hides only attempts from exam sessions that have not ended', async () => {
    const tutorUser = await createUser(db, cleanup);
    const examUser = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-active-exam-visibility-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const paramsJson = {
      count: 1,
      tagSlugs: [],
      difficulties: [],
      questionIds: [question.id],
    };
    // A user may hold one incomplete session, so the ended exam is closed
    // before the same user's tutor session opens.
    const endedExam = await sessionRepo.create({
      userId: tutorUser.id,
      mode: 'exam',
      paramsJson,
    });
    await sessionRepo.end(endedExam.id, tutorUser.id);
    const activeTutor = await sessionRepo.create({
      userId: tutorUser.id,
      mode: 'tutor',
      paramsJson,
    });
    const activeExam = await sessionRepo.create({
      userId: examUser.id,
      mode: 'exam',
      paramsJson,
    });
    const answeredAt = new Date('2026-09-01T12:00:00.000Z');
    for (const [userId, practiceSessionId] of [
      [tutorUser.id, null],
      [tutorUser.id, endedExam.id],
      [tutorUser.id, activeTutor.id],
      [examUser.id, activeExam.id],
    ] as const) {
      await insertAttemptAt({
        userId,
        questionId: question.id,
        practiceSessionId,
        selectedChoiceId: question.correctChoiceId,
        answeredAt,
      });
    }

    const visible = await db
      .select({ practiceSessionId: attempts.practiceSessionId })
      .from(attempts)
      .leftJoin(
        practiceSessions,
        eq(attempts.practiceSessionId, practiceSessions.id),
      )
      .where(
        and(
          inArray(attempts.userId, [tutorUser.id, examUser.id]),
          getActiveExamVisibilityCondition(),
        ),
      );

    expect(visible.map((row) => row.practiceSessionId).sort()).toEqual(
      [null, endedExam.id, activeTutor.id].sort(),
    );
  });
});
