import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
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

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

describe('practice-session history summary read', () => {
  it('returns one row per session and preserves total plus corrupt ordered-ID skip/log semantics', async () => {
    const user = await createUser(db, cleanup);
    const firstQuestion = await createQuestion(db, cleanup, {
      slug: `it-history-summary-first-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const secondQuestion = await createQuestion(db, cleanup, {
      slug: `it-history-summary-second-${randomUUID()}`,
      status: 'published',
      difficulty: 'medium',
    });
    const logger = new FakeLogger();
    const sessions = new DrizzlePracticeSessionRepository(
      db,
      () => new Date(),
      logger,
    );

    const healthy = await sessions.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 2,
        tagSlugs: [],
        difficulties: [],
        questionIds: [firstQuestion.id, secondQuestion.id],
      },
    });
    await sessions.end(healthy.id, user.id, new Date('2026-07-20T10:05:00Z'));
    await sql`
      UPDATE practice_session_question_states
      SET latest_selected_choice_id = ${firstQuestion.correctChoiceId},
          latest_is_correct = true,
          latest_answered_at = '2026-07-20T10:01:00Z'::timestamptz
      WHERE practice_session_id = ${healthy.id}
        AND question_id = ${firstQuestion.id}
    `;

    const corrupt = await sessions.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 2,
        tagSlugs: [],
        difficulties: [],
        questionIds: [firstQuestion.id, secondQuestion.id],
      },
    });
    await sessions.end(corrupt.id, user.id, new Date('2026-07-20T10:04:00Z'));
    await sql`
      UPDATE practice_session_question_states
      SET position = 2
      WHERE practice_session_id = ${corrupt.id}
        AND position = 0
    `;
    await sql`
      UPDATE practice_session_question_states
      SET position = 0
      WHERE practice_session_id = ${corrupt.id}
        AND position = 1
    `;
    await sql`
      UPDATE practice_session_question_states
      SET position = 1
      WHERE practice_session_id = ${corrupt.id}
        AND position = 2
    `;

    const result = await sessions.findCompletedHistorySummariesByUserId(
      user.id,
      10,
      0,
    );

    expect(result.total).toBe(2);
    expect(result.rows).toEqual([
      expect.objectContaining({
        sessionId: healthy.id,
        questionCount: 2,
        firstQuestionSlug: firstQuestion.slug,
        answered: 1,
        correct: 1,
      }),
    ]);
    expect(logger.warnCalls).toEqual([
      expect.objectContaining({
        context: expect.objectContaining({ sessionId: corrupt.id }),
        msg: 'Skipping corrupt completed practice session row',
      }),
    ]);
  });
});
