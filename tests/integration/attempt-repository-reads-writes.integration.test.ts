import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import { DrizzleAttemptRepository } from '@/src/adapters/repositories/drizzle-attempt-repository';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import {
  ApplicationError,
  AttemptConflictMessages,
} from '@/src/application/errors';
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
const oldDate = new Date('2026-01-01T00:00:00Z');
const cutoff = new Date('2026-01-02T00:00:00Z');
const newDate = new Date('2026-01-03T00:00:00Z');

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupAfterEach(db, cleanup);
});
afterAll(async () => {
  await closeConnection(sql);
});

async function fixture() {
  const user = await createUser(db, cleanup);
  const question = await createQuestion(db, cleanup, {
    slug: `it-attempt-write-${randomUUID()}`,
    status: 'published',
    difficulty: 'easy',
  });
  return {
    user,
    question,
    input: {
      userId: user.id,
      questionId: question.id,
      practiceSessionId: null,
      outcome: answeredOutcome(question.correctChoiceId),
      isCorrect: true,
      timeSpentSeconds: 42,
    },
  };
}

describe('attempt reads and writes against real Postgres', () => {
  it('persists and maps an explicit timestamp and every answered-attempt field', async () => {
    const { input, question } = await fixture();
    const attempt = await attempts.insert({ ...input, answeredAt: oldDate });
    const expected = {
      id: attempt.id,
      ...input,
      answeredAt: oldDate,
      retryOfAttemptId: null,
      retryOrigin: null,
      retrySessionId: null,
    };
    expect(attempt).toEqual(expected);
    await expect(
      attempts.findByUserId(input.userId, { limit: 10, offset: 0 }),
    ).resolves.toEqual([expected]);
    await expect(
      attempts.listRecentByUserId(input.userId, 10),
    ).resolves.toEqual([{ ...expected, sessionMode: null }]);
    const [stored] = await db
      .select()
      .from(schema.attempts)
      .where(eq(schema.attempts.id, attempt.id));
    expect(stored).toMatchObject({
      answeredAt: oldDate,
      selectedChoiceId: question.correctChoiceId,
      isOmitted: false,
      isCorrect: true,
      timeSpentSeconds: 42,
    });
  });

  it('uses the database timestamp when answeredAt is omitted', async () => {
    const { input } = await fixture();
    const [before] = await sql<
      { now: string }[]
    >`select floor(extract(epoch from clock_timestamp()) * 1000)::text as now`;
    const attempt = await attempts.insert(input);
    const [after] = await sql<
      { now: string }[]
    >`select floor(extract(epoch from clock_timestamp()) * 1000)::text as now`;
    if (!before || !after)
      throw new Error('Database clock query returned no row');
    expect(attempt.answeredAt.getTime()).toBeGreaterThanOrEqual(
      Number(before.now),
    );
    expect(attempt.answeredAt.getTime()).toBeLessThanOrEqual(Number(after.now));
  });

  it('maps a real duplicate session answer to the specific conflict without overwriting the first answer', async () => {
    const { user, question, input } = await fixture();
    const session = await sessions.create({
      userId: user.id,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        questionIds: [question.id],
        tagSlugs: [],
        difficulties: [],
      },
    });
    const sessionInput = { ...input, practiceSessionId: session.id };
    const original = await attempts.insert(sessionInput);
    await expect(
      attempts.insert({ ...sessionInput, timeSpentSeconds: 99 }),
    ).rejects.toEqual(
      new ApplicationError(
        'CONFLICT',
        AttemptConflictMessages.AlreadyAnsweredInSession,
      ),
    );
    await expect(
      attempts.findBySessionId(session.id, user.id),
    ).resolves.toEqual([original]);
  });

  it('pages only the requested user in descending timestamp order and clamps negative offsets', async () => {
    const { input } = await fixture();
    const other = await createUser(db, cleanup);
    const oldest = await attempts.insert({ ...input, answeredAt: oldDate });
    const middle = await attempts.insert({ ...input, answeredAt: cutoff });
    const newest = await attempts.insert({ ...input, answeredAt: newDate });
    await attempts.insert({
      ...input,
      userId: other.id,
      answeredAt: new Date('2026-01-04T00:00:00Z'),
    });
    await expect(
      attempts.findByUserId(input.userId, { limit: 1, offset: 1 }),
    ).resolves.toEqual([middle]);
    await expect(
      attempts.findByUserId(input.userId, { limit: 2, offset: -5 }),
    ).resolves.toEqual([newest, middle]);
    await expect(
      attempts.findByUserId(input.userId, { limit: 2, offset: 2 }),
    ).resolves.toEqual([oldest]);
  });

  it.each([0, -1, 1.5])(
    'returns no rows without querying for invalid page limit %s',
    async (limit) => {
      const { user } = await fixture();
      const query = vi.spyOn(db.query.attempts, 'findMany');
      await expect(
        attempts.findByUserId(user.id, { limit, offset: 0 }),
      ).resolves.toEqual([]);
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('returns no latest timestamps without querying when no question IDs are provided', async () => {
    const { user } = await fixture();
    const select = vi.spyOn(db, 'select');
    await expect(
      attempts.findMostRecentAnsweredAtByQuestionIds(user.id, []),
    ).resolves.toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });

  it('counts correct and total attempts at an inclusive date boundary and excludes other users', async () => {
    const { input, question } = await fixture();
    const other = await createUser(db, cleanup);
    await attempts.insert({ ...input, answeredAt: oldDate });
    await attempts.insert({ ...input, answeredAt: cutoff });
    await attempts.insert({
      ...input,
      answeredAt: newDate,
      isCorrect: false,
      outcome: answeredOutcome(question.incorrectChoiceId),
    });
    await attempts.insert({ ...input, userId: other.id, answeredAt: newDate });
    await expect(attempts.countByUserId(input.userId)).resolves.toBe(3);
    await expect(attempts.countCorrectByUserId(input.userId)).resolves.toBe(2);
    await expect(
      attempts.countByUserIdSince(input.userId, cutoff),
    ).resolves.toBe(2);
    await expect(
      attempts.countCorrectByUserIdSince(input.userId, cutoff),
    ).resolves.toBe(1);
    await expect(
      attempts.listAnsweredAtByUserIdSince(input.userId, cutoff),
    ).resolves.toEqual([newDate, cutoff]);
  });

  it('rejects null timestamps at the database boundary that feeds both latest-question projections', async () => {
    const { input, question } = await fixture();
    await expect(sql`insert into attempts (user_id, question_id, selected_choice_id, is_correct, answered_at)
      values (${input.userId}, ${input.questionId}, ${question.correctChoiceId}, true, null)`).rejects.toMatchObject(
      { code: '23502', column_name: 'answered_at' },
    );
    await expect(
      attempts.findMostRecentAnsweredAtByQuestionIds(input.userId, [
        input.questionId,
      ]),
    ).resolves.toEqual([]);
    await expect(
      attempts.listAttemptedQuestionsByUserId(input.userId, 10, 0),
    ).resolves.toEqual([]);
  });

  it('bounds session reads to the newest 500 attempts with an ID tie-breaker', async () => {
    const user = await createUser(db, cleanup);
    const questionIds = Array.from({ length: 501 }, () => randomUUID());
    cleanup.questionIds.push(...questionIds);
    await db.insert(schema.questions).values(
      questionIds.map((id) => ({
        id,
        slug: `it-bounded-session-${id}`,
        stemMd: 'Stem',
        explanationMd: 'Explanation',
        status: 'published' as const,
        difficulty: 'easy' as const,
      })),
    );
    const session = await sessions.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 200,
        questionIds: questionIds.slice(0, 200),
        tagSlugs: [],
        difficulties: [],
      },
    });
    // Seed a legacy-sized stored result directly: current session creation caps
    // the question list at 200, but the read boundary must still cap DB rows.
    const rows = questionIds.map((questionId) => ({
      id: randomUUID(),
      userId: user.id,
      questionId,
      practiceSessionId: session.id,
      isOmitted: true,
      isCorrect: false,
      answeredAt: oldDate,
    }));
    // The newest row has the lowest ID: ID-only ordering would exclude it at
    // the 500-row boundary. The older tied rows still prove the ID tie-breaker.
    const newest = rows.reduce((lowest, row) =>
      row.id < lowest.id ? row : lowest,
    );
    newest.answeredAt = newDate;
    await db.insert(schema.attempts).values(rows);
    const expectedIds = [
      newest.id,
      ...rows
        .filter((row) => row.id !== newest.id)
        .map((row) => row.id)
        .sort()
        .reverse(),
    ].slice(0, 500);
    const actual = await attempts.findBySessionId(session.id, user.id);
    expect(actual.map((attempt) => attempt.id)).toEqual(expectedIds);
    expect(actual.every((attempt) => attempt.outcome.kind === 'omitted')).toBe(
      true,
    );
  });
});
