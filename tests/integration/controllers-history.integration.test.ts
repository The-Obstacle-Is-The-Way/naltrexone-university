import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { getAttemptedQuestions } from '@/src/adapters/controllers/review-controller';
import { getUserStats } from '@/src/adapters/controllers/stats-controller';
import { DrizzleAttemptRepository } from '@/src/adapters/repositories/drizzle-attempt-repository';
import { DrizzleQuestionRepository } from '@/src/adapters/repositories/drizzle-question-repository';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { GetAttemptedQuestionsUseCase } from '@/src/application/use-cases/get-attempted-questions';
import { GetUserStatsUseCase } from '@/src/application/use-cases/get-user-stats';

import {
  cleanupAfterEach,
  closeConnection,
  createAuthGateway,
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

describe('stats controller (integration)', () => {
  it('aggregates totals, windows, streak, and recent activity from real DB', async () => {
    const user = await createUser(db, cleanup);
    const slugA = `it-stats-a-${randomUUID()}`;
    const questionA = await createQuestion(db, cleanup, {
      slug: slugA,
      status: 'published',
      difficulty: 'easy',
    });
    const slugB = `it-stats-b-${randomUUID()}`;
    const questionB = await createQuestion(db, cleanup, {
      slug: slugB,
      status: 'published',
      difficulty: 'easy',
    });
    const slugC = `it-stats-omitted-${randomUUID()}`;
    const questionC = await createQuestion(db, cleanup, {
      slug: slugC,
      status: 'published',
      difficulty: 'easy',
    });

    const now = new Date('2026-02-10T12:00:00.000Z');

    await db.insert(schema.attempts).values([
      {
        userId: user.id,
        questionId: questionA.id,
        practiceSessionId: null,
        selectedChoiceId: questionA.correctChoiceId,
        isCorrect: true,
        timeSpentSeconds: 10,
        answeredAt: new Date('2026-02-02T12:00:00.000Z'),
      },
      {
        userId: user.id,
        questionId: questionB.id,
        practiceSessionId: null,
        selectedChoiceId: questionB.incorrectChoiceId,
        isCorrect: false,
        timeSpentSeconds: 10,
        answeredAt: new Date('2026-02-09T12:00:00.000Z'),
      },
      {
        userId: user.id,
        questionId: questionA.id,
        practiceSessionId: null,
        selectedChoiceId: questionA.correctChoiceId,
        isCorrect: true,
        timeSpentSeconds: 10,
        answeredAt: new Date('2026-02-10T11:00:00.000Z'),
      },
      {
        userId: user.id,
        questionId: questionC.id,
        practiceSessionId: null,
        selectedChoiceId: null,
        isOmitted: true,
        isCorrect: false,
        timeSpentSeconds: 0,
        answeredAt: new Date('2026-02-10T10:00:00.000Z'),
      },
    ]);

    const authGateway = createAuthGateway(user);

    const result = await getUserStats(
      {},
      {
        authGateway,
        checkEntitlementUseCase: {
          execute: async () => ({ isEntitled: true }),
        },
        getUserStatsUseCase: new GetUserStatsUseCase(
          new DrizzleAttemptRepository(db),
          new DrizzleQuestionRepository(db),
          new FakeLogger(),
          () => now,
        ),
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.totalAnswered).toBe(4);
    expect(result.data.accuracyOverall).toBeCloseTo(2 / 4);
    expect(result.data.answeredLast7Days).toBe(3);
    expect(result.data.accuracyLast7Days).toBeCloseTo(1 / 3);
    expect(result.data.currentStreakDays).toBe(2);
    expect(result.data.recentActivity[0]).toMatchObject({
      isAvailable: true,
      slug: slugA,
      isCorrect: true,
    });
    const slugs = result.data.recentActivity.flatMap((row) =>
      row.isAvailable ? [row.slug] : [],
    );
    expect(slugs).toContain(slugB);
    expect(slugs).toContain(slugC);
    expect(result.data.recentActivity).toContainEqual(
      expect.objectContaining({
        isAvailable: true,
        slug: slugC,
        isCorrect: false,
      }),
    );
  });
});

describe('review controller (integration)', () => {
  it('lists attempted questions (incorrect) and marks unavailable ones when they are no longer published', async () => {
    const user = await createUser(db, cleanup);
    const incorrectSlug = `it-incorrect-${randomUUID()}`;
    const incorrectQuestion = await createQuestion(db, cleanup, {
      slug: incorrectSlug,
      status: 'published',
      difficulty: 'easy',
    });
    const recoveredQuestion = await createQuestion(db, cleanup, {
      slug: `it-recovered-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const t1 = new Date('2026-02-01T00:00:00.000Z');
    const t2 = new Date('2026-02-02T00:00:00.000Z');
    const t3 = new Date('2026-02-03T00:00:00.000Z');
    const t4 = new Date('2026-02-04T00:00:00.000Z');

    await db.insert(schema.attempts).values([
      {
        userId: user.id,
        questionId: incorrectQuestion.id,
        practiceSessionId: null,
        selectedChoiceId: incorrectQuestion.correctChoiceId,
        isCorrect: true,
        timeSpentSeconds: 1,
        answeredAt: t1,
      },
      {
        userId: user.id,
        questionId: incorrectQuestion.id,
        practiceSessionId: null,
        selectedChoiceId: incorrectQuestion.incorrectChoiceId,
        isCorrect: false,
        timeSpentSeconds: 1,
        answeredAt: t2,
      },
      {
        userId: user.id,
        questionId: recoveredQuestion.id,
        practiceSessionId: null,
        selectedChoiceId: recoveredQuestion.incorrectChoiceId,
        isCorrect: false,
        timeSpentSeconds: 1,
        answeredAt: t3,
      },
      {
        userId: user.id,
        questionId: recoveredQuestion.id,
        practiceSessionId: null,
        selectedChoiceId: recoveredQuestion.correctChoiceId,
        isCorrect: true,
        timeSpentSeconds: 1,
        answeredAt: t4,
      },
    ]);

    const logger = new FakeLogger();

    const authGateway = createAuthGateway(user);

    const deps = {
      authGateway,
      checkEntitlementUseCase: {
        execute: async () => ({ isEntitled: true }),
      },
      getAttemptedQuestionsUseCase: new GetAttemptedQuestionsUseCase(
        new DrizzleAttemptRepository(db),
        new DrizzleQuestionRepository(db),
        logger,
      ),
    };

    const first = await getAttemptedQuestions(
      { limit: 10, offset: 0, result: 'incorrect' },
      deps,
    );

    expect(first.ok).toBe(true);
    if (!first.ok) return;

    expect(first.data.rows).toHaveLength(1);
    expect(first.data.rows[0]).toMatchObject({
      isAvailable: true,
      questionId: incorrectQuestion.id,
      isCorrect: false,
      sessionId: null,
      sessionMode: null,
      slug: incorrectSlug,
      stemMd: '# Stem',
      difficulty: 'easy',
      tagSlugs: [],
      lastAnsweredAt: t2.toISOString(),
    });
    expect(logger.warnCalls).toHaveLength(0);

    await db
      .update(schema.questions)
      .set({ status: 'draft' })
      .where(eq(schema.questions.id, incorrectQuestion.id));

    const second = await getAttemptedQuestions(
      { limit: 10, offset: 0, result: 'incorrect' },
      deps,
    );

    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.data.rows).toEqual([
      {
        isAvailable: false,
        questionId: incorrectQuestion.id,
        isCorrect: false,
        sessionId: null,
        sessionMode: null,
        lastAnsweredAt: t2.toISOString(),
      },
    ]);
    expect(logger.warnCalls).toEqual([
      {
        context: { questionId: incorrectQuestion.id },
        msg: 'Attempted question references missing question',
      },
    ]);
  });

  it('applies incorrect-first ordering before pagination across pages', async () => {
    const user = await createUser(db, cleanup);
    const correctRecent = await createQuestion(db, cleanup, {
      slug: `it-correct-recent-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const incorrectRecent = await createQuestion(db, cleanup, {
      slug: `it-incorrect-recent-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const correctOld = await createQuestion(db, cleanup, {
      slug: `it-correct-old-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const incorrectOld = await createQuestion(db, cleanup, {
      slug: `it-incorrect-old-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    await db.insert(schema.attempts).values([
      {
        userId: user.id,
        questionId: correctRecent.id,
        practiceSessionId: null,
        selectedChoiceId: correctRecent.correctChoiceId,
        isCorrect: true,
        timeSpentSeconds: 1,
        answeredAt: new Date('2026-02-04T00:00:00.000Z'),
      },
      {
        userId: user.id,
        questionId: incorrectRecent.id,
        practiceSessionId: null,
        selectedChoiceId: incorrectRecent.incorrectChoiceId,
        isCorrect: false,
        timeSpentSeconds: 1,
        answeredAt: new Date('2026-02-03T00:00:00.000Z'),
      },
      {
        userId: user.id,
        questionId: correctOld.id,
        practiceSessionId: null,
        selectedChoiceId: correctOld.correctChoiceId,
        isCorrect: true,
        timeSpentSeconds: 1,
        answeredAt: new Date('2026-02-02T00:00:00.000Z'),
      },
      {
        userId: user.id,
        questionId: incorrectOld.id,
        practiceSessionId: null,
        selectedChoiceId: incorrectOld.incorrectChoiceId,
        isCorrect: false,
        timeSpentSeconds: 1,
        answeredAt: new Date('2026-02-01T00:00:00.000Z'),
      },
    ]);

    const authGateway = createAuthGateway(user);

    const deps = {
      authGateway,
      checkEntitlementUseCase: {
        execute: async () => ({ isEntitled: true }),
      },
      getAttemptedQuestionsUseCase: new GetAttemptedQuestionsUseCase(
        new DrizzleAttemptRepository(db),
        new DrizzleQuestionRepository(db),
        new FakeLogger(),
      ),
    };

    const firstPage = await getAttemptedQuestions(
      { limit: 2, offset: 0, sort: 'incorrect-first' },
      deps,
    );

    expect(firstPage.ok).toBe(true);
    if (!firstPage.ok) return;

    expect(firstPage.data.rows.map((row) => row.questionId)).toEqual([
      incorrectRecent.id,
      incorrectOld.id,
    ]);
    expect(firstPage.data.rows.every((row) => row.isCorrect === false)).toBe(
      true,
    );

    const secondPage = await getAttemptedQuestions(
      { limit: 2, offset: 2, sort: 'incorrect-first' },
      deps,
    );

    expect(secondPage.ok).toBe(true);
    if (!secondPage.ok) return;

    expect(secondPage.data.rows.map((row) => row.questionId)).toEqual([
      correctRecent.id,
      correctOld.id,
    ]);
    expect(secondPage.data.rows.every((row) => row.isCorrect === true)).toBe(
      true,
    );
  });
});
