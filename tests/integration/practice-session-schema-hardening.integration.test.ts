import { randomUUID } from 'node:crypto';
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

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

function createRepository(logger = new FakeLogger()) {
  return {
    logger,
    sessions: new DrizzlePracticeSessionRepository(
      db,
      () => new Date(),
      logger,
    ),
  };
}

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

describe('practice session schema hardening', () => {
  it('rejects string-typed practice session params_json', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-params-shape-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const paramsJson = JSON.stringify({
      count: 1,
      tagSlugs: [],
      difficulties: [],
      questionIds: [question.id],
    });

    await expect(sql`
      INSERT INTO practice_sessions (user_id, mode, params_json, ended_at)
      VALUES (
        ${user.id},
        'tutor',
        to_jsonb(${paramsJson}::text),
        now()
      )
    `).rejects.toThrow();
  });

  it('rejects attempts whose selected choice belongs to a different question', async () => {
    const user = await createUser(db, cleanup);
    const attemptQuestion = await createQuestion(db, cleanup, {
      slug: `it-attempt-question-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const otherQuestion = await createQuestion(db, cleanup, {
      slug: `it-attempt-choice-owner-${randomUUID()}`,
      status: 'published',
      difficulty: 'medium',
    });

    await expect(
      db.insert(schema.attempts).values({
        userId: user.id,
        questionId: attemptQuestion.id,
        selectedChoiceId: otherQuestion.correctChoiceId,
        isOmitted: false,
        isCorrect: false,
        timeSpentSeconds: 1,
      }),
    ).rejects.toThrow();
  });

  it('skips and logs corrupt completed practice-session rows in list reads', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-completed-session-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const { logger, sessions } = createRepository();
    const healthySession = await sessions.create({
      userId: user.id,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });
    await sessions.end(healthySession.id, user.id, new Date('2026-07-01'));

    await sql`
      INSERT INTO practice_sessions (user_id, mode, params_json, ended_at)
      VALUES (${user.id}, 'tutor', '{}'::jsonb, '2026-07-02'::timestamptz)
    `;

    const result = await sessions.findCompletedByUserId(user.id, 10, 0);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.id).toBe(healthySession.id);
    expect(logger.warnCalls).toEqual([
      expect.objectContaining({
        context: expect.objectContaining({
          userId: user.id,
          mode: null,
        }),
        msg: 'Skipping corrupt completed practice session row',
      }),
    ]);
  });

  it('skips and logs a corrupt latest incomplete practice-session row', async () => {
    const user = await createUser(db, cleanup);
    const { logger, sessions } = createRepository();

    await sql`
      INSERT INTO practice_sessions (user_id, mode, params_json, ended_at)
      VALUES (${user.id}, 'tutor', '{}'::jsonb, null)
    `;

    await expect(sessions.findLatestIncompleteByUserId(user.id)).resolves.toBe(
      null,
    );
    expect(logger.warnCalls).toEqual([
      expect.objectContaining({
        context: expect.objectContaining({
          userId: user.id,
        }),
        msg: 'Skipping corrupt incomplete practice session row',
      }),
    ]);
  });

  it('does not commit end() before reporting a corrupt practice-session row', async () => {
    const user = await createUser(db, cleanup);
    const { sessions } = createRepository();
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO practice_sessions (user_id, mode, params_json, ended_at)
      VALUES (${user.id}, 'tutor', '{}'::jsonb, null)
      RETURNING id
    `;
    if (!row) throw new Error('Failed to insert corrupt practice session row');

    await expect(sessions.end(row.id, user.id)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });

    const [persisted] = await sql<{ ended_at: Date | null }[]>`
      SELECT ended_at
      FROM practice_sessions
      WHERE id = ${row.id}
    `;
    if (!persisted) throw new Error('Failed to reload practice session row');
    expect(persisted.ended_at).toBeNull();
  });
});
