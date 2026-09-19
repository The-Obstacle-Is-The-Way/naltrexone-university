import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { DrizzleAttemptRepository } from '@/src/adapters/repositories/drizzle-attempt-repository';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import { answeredOutcome } from '@/src/domain/value-objects';
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
const attempts = new DrizzleAttemptRepository(db);
const sessions = new DrizzlePracticeSessionRepository(db);

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

async function question() {
  return createQuestion(db, cleanup, {
    slug: `it-attempt-filter-${randomUUID()}`,
    status: 'published',
    difficulty: 'easy',
  });
}

async function answer(input: {
  userId: string;
  question: Awaited<ReturnType<typeof question>>;
  isCorrect: boolean;
  sessionId: string | null;
  answeredAt: Date;
}) {
  const attempt = await attempts.insert({
    userId: input.userId,
    questionId: input.question.id,
    practiceSessionId: input.sessionId,
    outcome: answeredOutcome(
      input.isCorrect
        ? input.question.correctChoiceId
        : input.question.incorrectChoiceId,
    ),
    isCorrect: input.isCorrect,
    timeSpentSeconds: 1,
  });
  await db
    .update(schema.attempts)
    .set({ answeredAt: input.answeredAt })
    .where(eq(schema.attempts.id, attempt.id));
}

describe('attempted-question filters against real Postgres', () => {
  it.each(['correct', 'incorrect'] as const)(
    'filters rows and counts by the latest %s result',
    async (result) => {
      const user = await createUser(db, cleanup);
      const matching = await question();
      const excluded = await question();
      const isCorrect = result === 'correct';

      for (const [currentQuestion, latestIsCorrect] of [
        [matching, isCorrect],
        [excluded, !isCorrect],
      ] as const) {
        await answer({
          userId: user.id,
          question: currentQuestion,
          isCorrect: !latestIsCorrect,
          sessionId: null,
          answeredAt: new Date('2026-01-01T00:00:00Z'),
        });
        await answer({
          userId: user.id,
          question: currentQuestion,
          isCorrect: latestIsCorrect,
          sessionId: null,
          answeredAt: new Date('2026-01-02T00:00:00Z'),
        });
      }

      const rows = await attempts.listAttemptedQuestionsByUserId(
        user.id,
        10,
        0,
        { result },
      );

      expect(rows.map((row) => row.questionId)).toEqual([matching.id]);
      expect(rows[0]?.isCorrect).toBe(isCorrect);
      await expect(
        attempts.countAttemptedQuestionsByUserId(user.id, { result }),
      ).resolves.toBe(1);
    },
  );

  it.each(['adhoc', 'tutor', 'exam'] as const)(
    'filters rows and counts by the latest %s source',
    async (source) => {
      const user = await createUser(db, cleanup);
      const questions = {
        adhoc: await question(),
        tutor: await question(),
        exam: await question(),
      };
      const sessionIds = new Map<string, string>();

      for (const mode of ['tutor', 'exam'] as const) {
        const session = await sessions.create({
          userId: user.id,
          mode,
          paramsJson: {
            count: 3,
            tagSlugs: [],
            difficulties: [],
            questionIds: Object.values(questions).map((q) => q.id),
          },
        });
        sessionIds.set(mode, session.id);
        await sessions.end(session.id, user.id);
      }

      for (const mode of ['adhoc', 'tutor', 'exam'] as const) {
        // An older matching source must not make a currently different source
        // match. The matching question also has a nonmatching older source.
        const olderSource =
          mode === source ? (source === 'adhoc' ? 'tutor' : 'adhoc') : source;
        await answer({
          userId: user.id,
          question: questions[mode],
          isCorrect: true,
          sessionId: sessionIds.get(olderSource) ?? null,
          answeredAt: new Date('2026-01-01T00:00:00Z'),
        });
        await answer({
          userId: user.id,
          question: questions[mode],
          isCorrect: true,
          sessionId: sessionIds.get(mode) ?? null,
          answeredAt: new Date('2026-01-02T00:00:00Z'),
        });
      }

      const rows = await attempts.listAttemptedQuestionsByUserId(
        user.id,
        10,
        0,
        { source },
      );

      expect(rows.map((row) => row.questionId)).toEqual([questions[source].id]);
      expect(rows[0]?.sessionId).toBe(sessionIds.get(source) ?? null);
      expect(rows[0]?.sessionMode).toBe(source === 'adhoc' ? null : source);
      await expect(
        attempts.countAttemptedQuestionsByUserId(user.id, { source }),
      ).resolves.toBe(1);
    },
  );
});
