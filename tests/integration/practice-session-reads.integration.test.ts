import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
  createUser,
} from './helpers';

// Real-Postgres twins for the retired practice-session read units: domain
// mapping, latest-incomplete and completed-page reads, corruption reported by
// findByIdAndUserId, and history summaries skipped for shape corruption.
const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

type QuestionFixture = Awaited<ReturnType<typeof createQuestion>>;

async function createThreeQuestions(): Promise<
  [QuestionFixture, QuestionFixture, QuestionFixture]
> {
  const questions: QuestionFixture[] = [];
  for (let index = 0; index < 3; index += 1) {
    questions.push(
      await createQuestion(db, cleanup, {
        slug: `it-ps-reads-${index}-${randomUUID()}`,
        status: 'published',
        difficulty: 'easy',
      }),
    );
  }
  const [first, second, third] = questions;
  if (!first || !second || !third) {
    throw new Error('Expected three question fixtures');
  }
  return [first, second, third];
}

async function createSession(input: {
  repo: DrizzlePracticeSessionRepository;
  userId: string;
  questionIds: readonly string[];
  mode?: 'tutor' | 'exam';
  tagSlugs?: readonly string[];
  difficulties?: readonly ('easy' | 'medium' | 'hard')[];
}) {
  return input.repo.create({
    userId: input.userId,
    mode: input.mode ?? 'tutor',
    paramsJson: {
      count: input.questionIds.length,
      tagSlugs: input.tagSlugs ?? [],
      difficulties: input.difficulties ?? [],
      questionIds: input.questionIds,
    },
  });
}

async function insertSurplusStateRow(sessionId: string, questionId: string) {
  await db.insert(schema.practiceSessionQuestionStates).values({
    practiceSessionId: sessionId,
    questionId,
    position: 2,
  });
}

describe('DrizzlePracticeSessionRepository reads', () => {
  it('returns null from findByIdAndUserId for an unknown id and for another user', async () => {
    const user = await createUser(db, cleanup);
    const other = await createUser(db, cleanup);
    const [question] = await createThreeQuestions();
    const repo = new DrizzlePracticeSessionRepository(db);
    const session = await createSession({
      repo,
      userId: user.id,
      questionIds: [question.id],
    });

    await expect(
      repo.findByIdAndUserId(randomUUID(), user.id),
    ).resolves.toBeNull();
    await expect(
      repo.findByIdAndUserId(session.id, other.id),
    ).resolves.toBeNull();
  });

  it('maps a session to its domain shape with its filters and ordered question states', async () => {
    const user = await createUser(db, cleanup);
    const [first, second] = await createThreeQuestions();
    const repo = new DrizzlePracticeSessionRepository(db);
    const session = await createSession({
      repo,
      userId: user.id,
      questionIds: [first.id, second.id],
      tagSlugs: ['opioids'],
      difficulties: ['easy', 'hard'],
    });

    const found = await repo.findByIdAndUserId(session.id, user.id);

    expect(found).toMatchObject({
      id: session.id,
      userId: user.id,
      mode: 'tutor',
      questionIds: [first.id, second.id],
      tagFilters: ['opioids'],
      difficultyFilters: ['easy', 'hard'],
      endedAt: null,
    });
    expect(found?.startedAt).toBeInstanceOf(Date);
    expect(found?.questionStates.map((state) => state.questionId)).toEqual([
      first.id,
      second.id,
    ]);
    expect(
      found?.questionStates.every(
        (state) => state.latestSelectedChoiceId === null,
      ),
    ).toBe(true);
  });

  it('returns null from findLatestIncompleteByUserId when every session has ended', async () => {
    const user = await createUser(db, cleanup);
    const [question] = await createThreeQuestions();
    const repo = new DrizzlePracticeSessionRepository(db);

    await expect(
      repo.findLatestIncompleteByUserId(user.id),
    ).resolves.toBeNull();
    const session = await createSession({
      repo,
      userId: user.id,
      questionIds: [question.id],
    });
    await repo.end(session.id, user.id);
    await expect(
      repo.findLatestIncompleteByUserId(user.id),
    ).resolves.toBeNull();
  });

  it('returns the latest incomplete session after an earlier one ended', async () => {
    const user = await createUser(db, cleanup);
    const [question] = await createThreeQuestions();
    const repo = new DrizzlePracticeSessionRepository(db);
    const earlier = await createSession({
      repo,
      userId: user.id,
      questionIds: [question.id],
    });
    await repo.end(earlier.id, user.id);
    const latest = await createSession({
      repo,
      userId: user.id,
      questionIds: [question.id],
    });

    await expect(
      repo.findLatestIncompleteByUserId(user.id),
    ).resolves.toMatchObject({
      id: latest.id,
      endedAt: null,
    });
  });

  describe('completed pages', () => {
    async function createCompletedTrio() {
      const user = await createUser(db, cleanup);
      const [question] = await createThreeQuestions();
      const repo = new DrizzlePracticeSessionRepository(db);
      const ids: string[] = [];
      const endedAts = [
        new Date('2026-03-03T10:00:00.000Z'),
        new Date('2026-03-03T11:00:00.000Z'),
        new Date('2026-03-03T12:00:00.000Z'),
      ];
      for (const endedAt of endedAts) {
        const session = await createSession({
          repo,
          userId: user.id,
          questionIds: [question.id],
        });
        await repo.end(session.id, user.id, endedAt);
        ids.push(session.id);
      }
      return { user, repo, ids, endedAts };
    }

    it('pages completed sessions newest-ended first with the total count', async () => {
      const { user, repo, ids } = await createCompletedTrio();

      const firstPage = await repo.findCompletedByUserId(user.id, 2, 0);
      const secondPage = await repo.findCompletedByUserId(user.id, 2, 2);

      expect(firstPage.total).toBe(3);
      expect(firstPage.rows.map((row) => row.id)).toEqual([ids[2], ids[1]]);
      expect(secondPage.total).toBe(3);
      expect(secondPage.rows.map((row) => row.id)).toEqual([ids[0]]);
    });

    it.each([0, -1, 1.5])(
      'returns no rows but the total when the limit is %s',
      async (limit) => {
        const { user, repo } = await createCompletedTrio();

        await expect(
          repo.findCompletedByUserId(user.id, limit, 0),
        ).resolves.toEqual({ rows: [], total: 3 });
      },
    );

    it('returns an empty page when the offset exceeds the matching rows', async () => {
      const { user, repo } = await createCompletedTrio();

      await expect(
        repo.findCompletedByUserId(user.id, 10, 50),
      ).resolves.toEqual({ rows: [], total: 3 });
    });

    it('filters completed sessions by mode', async () => {
      const user = await createUser(db, cleanup);
      const [question] = await createThreeQuestions();
      const repo = new DrizzlePracticeSessionRepository(db);
      const tutor = await createSession({
        repo,
        userId: user.id,
        questionIds: [question.id],
        mode: 'tutor',
      });
      await repo.end(tutor.id, user.id, new Date('2026-03-03T13:00:00.000Z'));
      const exam = await createSession({
        repo,
        userId: user.id,
        questionIds: [question.id],
        mode: 'exam',
      });
      await repo.end(exam.id, user.id, new Date('2026-03-03T14:00:00.000Z'));

      const examPage = await repo.findCompletedByUserId(user.id, 10, 0, 'exam');

      expect(examPage.total).toBe(1);
      expect(examPage.rows.map((row) => row.id)).toEqual([exam.id]);
    });
  });

  describe('corruption reported by findByIdAndUserId', () => {
    it('throws INTERNAL_ERROR when normalized state has surplus rows', async () => {
      const user = await createUser(db, cleanup);
      const [first, second, surplus] = await createThreeQuestions();
      const repo = new DrizzlePracticeSessionRepository(db);
      const session = await createSession({
        repo,
        userId: user.id,
        questionIds: [first.id, second.id],
      });
      await insertSurplusStateRow(session.id, surplus.id);

      await expect(
        repo.findByIdAndUserId(session.id, user.id),
      ).rejects.toMatchObject({
        code: 'INTERNAL_ERROR',
        message: `Practice session ${session.id} has inconsistent normalized question state`,
      });
    });

    it('throws INTERNAL_ERROR when the persisted paramsJson is invalid', async () => {
      const user = await createUser(db, cleanup);
      const [question] = await createThreeQuestions();
      const repo = new DrizzlePracticeSessionRepository(db);
      const session = await createSession({
        repo,
        userId: user.id,
        questionIds: [question.id],
      });
      // The column only checks jsonb_typeof = 'object'; the shape is the
      // repository's responsibility.
      await sql`
        update practice_sessions set params_json = '{"count":0}'::jsonb
        where id = ${session.id}
      `;

      await expect(
        repo.findByIdAndUserId(session.id, user.id),
      ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    });
  });
});

describe('DrizzlePracticeSessionRepository history summaries', () => {
  async function createCompletedPair() {
    const user = await createUser(db, cleanup);
    const [first, second, extra] = await createThreeQuestions();
    const logger = new FakeLogger();
    const repo = new DrizzlePracticeSessionRepository(db, undefined, logger);
    const session = await createSession({
      repo,
      userId: user.id,
      questionIds: [first.id, second.id],
    });
    await repo.end(session.id, user.id, new Date('2026-03-04T10:00:00.000Z'));
    return { user, first, second, extra, logger, repo, session };
  }

  function expectSkipped(
    result: { rows: readonly unknown[]; total: number },
    logger: FakeLogger,
    sessionId: string,
  ) {
    expect(result).toEqual({ rows: [], total: 1 });
    expect(logger.warnCalls).toEqual([
      expect.objectContaining({
        context: expect.objectContaining({ sessionId }),
        msg: 'Skipping corrupt completed practice session row',
      }),
    ]);
  }

  it('skips and logs a summary whose normalized positions do not start at zero', async () => {
    const { user, logger, repo, session } = await createCompletedPair();
    // Shift positions 0,1 to 1,2 in two statements; the (session, position)
    // uniqueness is checked per row.
    await sql`
      update practice_session_question_states set position = 2
      where practice_session_id = ${session.id} and position = 1
    `;
    await sql`
      update practice_session_question_states set position = 1
      where practice_session_id = ${session.id} and position = 0
    `;

    const result = await repo.findCompletedHistorySummariesByUserId(
      user.id,
      10,
      0,
    );

    expectSkipped(result, logger, session.id);
  });

  it('skips and logs a summary with an extra normalized row', async () => {
    const { user, extra, logger, repo, session } = await createCompletedPair();
    await insertSurplusStateRow(session.id, extra.id);

    const result = await repo.findCompletedHistorySummariesByUserId(
      user.id,
      10,
      0,
    );

    expectSkipped(result, logger, session.id);
  });

  it('skips and logs a summary missing a normalized row', async () => {
    const { user, second, logger, repo, session } = await createCompletedPair();
    await db
      .delete(schema.practiceSessionQuestionStates)
      .where(eq(schema.practiceSessionQuestionStates.questionId, second.id));

    const result = await repo.findCompletedHistorySummariesByUserId(
      user.id,
      10,
      0,
    );

    expectSkipped(result, logger, session.id);
  });
});
