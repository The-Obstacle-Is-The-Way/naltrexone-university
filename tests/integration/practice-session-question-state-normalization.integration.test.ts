import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
  createUser,
} from './helpers';
import { readDebt425BackfillSql } from './practice-session-state-backfill-helper';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

type LegacyPracticeSessionParams = schema.PracticeSessionParams & {
  questionStates?: Array<{
    questionId: string;
    markedForReview: boolean;
    latestSelectedChoiceId: string | null;
    latestIsCorrect: boolean | null;
    latestAnsweredAt: string | null;
    draftSelectedChoiceId?: string | null;
    draftSavedAt?: string | null;
    draftCumulativeMs?: number;
  }>;
};

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

describe('practice session question state normalization', () => {
  it('fails loudly when the marked DEBT-425 backfill block is missing', () => {
    const migrationsDir = mkdtempSync(join(tmpdir(), 'debt-425-backfill-'));
    try {
      writeFileSync(
        join(migrationsDir, '0001_unrelated.sql'),
        'SELECT 1;--> statement-breakpoint\n',
      );

      expect(() => readDebt425BackfillSql(migrationsDir)).toThrow(
        'Missing DEBT-425 marked backfill migration block',
      );
    } finally {
      rmSync(migrationsDir, { recursive: true, force: true });
    }
  });

  it('backfills legacy params_json states into relational rows idempotently', async () => {
    const user = await createUser(db, cleanup);
    const firstQuestion = await createQuestion(db, cleanup, {
      slug: `it-state-backfill-first-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const secondQuestion = await createQuestion(db, cleanup, {
      slug: `it-state-backfill-second-${randomUUID()}`,
      status: 'published',
      difficulty: 'medium',
    });

    const legacyParamsJson: LegacyPracticeSessionParams = {
      count: 2,
      tagSlugs: [],
      difficulties: [],
      questionIds: [firstQuestion.id, secondQuestion.id],
      questionStates: [
        {
          questionId: firstQuestion.id,
          markedForReview: true,
          latestSelectedChoiceId: firstQuestion.correctChoiceId,
          latestIsCorrect: true,
          latestAnsweredAt: '2026-03-17T12:00:00.000Z',
        },
        {
          questionId: secondQuestion.id,
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: secondQuestion.incorrectChoiceId,
          draftSavedAt: '2026-04-25T12:00:00.000Z',
          draftCumulativeMs: Number.MAX_SAFE_INTEGER,
        },
      ],
    };

    const [session] = await db
      .insert(schema.practiceSessions)
      .values({
        userId: user.id,
        mode: 'exam',
        paramsJson: legacyParamsJson,
        endedAt: new Date('2026-04-25T13:00:00.000Z'),
      })
      .returning({ id: schema.practiceSessions.id });

    if (!session) throw new Error('Failed to insert legacy session');

    const backfillSql = readDebt425BackfillSql();
    await sql.unsafe(backfillSql);
    await sql.unsafe(backfillSql);

    const rows = await sql<
      Array<{
        question_id: string;
        position: number;
        marked_for_review: boolean;
        latest_selected_choice_id: string | null;
        latest_is_correct: boolean | null;
        latest_answered_at: string | null;
        draft_selected_choice_id: string | null;
        draft_saved_at: string | null;
        draft_cumulative_ms: number;
        state_count: number;
      }>
    >`
      SELECT
        question_id::text,
        position,
        marked_for_review,
        latest_selected_choice_id::text,
        latest_is_correct,
        latest_answered_at,
        draft_selected_choice_id::text,
        draft_saved_at,
        draft_cumulative_ms,
        count(*) OVER ()::int AS state_count
      FROM practice_session_question_states
      WHERE practice_session_id = ${session.id}
      ORDER BY position
    `;

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.state_count)).toEqual([2, 2]);
    expect(rows[0]).toMatchObject({
      question_id: firstQuestion.id,
      position: 0,
      marked_for_review: true,
      latest_selected_choice_id: firstQuestion.correctChoiceId,
      latest_is_correct: true,
      latest_answered_at: '2026-03-17 12:00:00+00',
      draft_selected_choice_id: null,
      draft_saved_at: null,
      draft_cumulative_ms: 0,
    });
    expect(rows[1]).toMatchObject({
      question_id: secondQuestion.id,
      position: 1,
      marked_for_review: false,
      latest_selected_choice_id: null,
      latest_is_correct: null,
      latest_answered_at: null,
      draft_selected_choice_id: secondQuestion.incorrectChoiceId,
      draft_saved_at: '2026-04-25 12:00:00+00',
      draft_cumulative_ms: 86_400_000,
    });
  });

  it('creates relational state rows and leaves params_json immutable', async () => {
    const user = await createUser(db, cleanup);
    const firstQuestion = await createQuestion(db, cleanup, {
      slug: `it-state-create-first-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const secondQuestion = await createQuestion(db, cleanup, {
      slug: `it-state-create-second-${randomUUID()}`,
      status: 'published',
      difficulty: 'hard',
    });
    const sessions = new DrizzlePracticeSessionRepository(db);

    const session = await sessions.create({
      userId: user.id,
      mode: 'tutor',
      paramsJson: {
        count: 2,
        tagSlugs: ['opioids'],
        difficulties: ['easy', 'hard'],
        questionIds: [firstQuestion.id, secondQuestion.id],
      },
    });

    const [storedSession] = await db
      .select({ paramsJson: schema.practiceSessions.paramsJson })
      .from(schema.practiceSessions)
      .where(eq(schema.practiceSessions.id, session.id));
    expect(storedSession?.paramsJson).toEqual({
      count: 2,
      tagSlugs: ['opioids'],
      difficulties: ['easy', 'hard'],
      questionIds: [firstQuestion.id, secondQuestion.id],
    });

    const stateRows = await sql<
      Array<{
        question_id: string;
        position: number;
        draft_cumulative_ms: number;
        version: number;
      }>
    >`
      SELECT question_id::text, position, draft_cumulative_ms, version
      FROM practice_session_question_states
      WHERE practice_session_id = ${session.id}
      ORDER BY position
    `;
    expect(stateRows).toEqual([
      {
        question_id: firstQuestion.id,
        position: 0,
        draft_cumulative_ms: 0,
        version: 0,
      },
      {
        question_id: secondQuestion.id,
        position: 1,
        draft_cumulative_ms: 0,
        version: 0,
      },
    ]);
  });

  it('preserves independent concurrent updates and rejects stale same-row writes', async () => {
    const user = await createUser(db, cleanup);
    const firstQuestion = await createQuestion(db, cleanup, {
      slug: `it-state-concurrent-first-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const secondQuestion = await createQuestion(db, cleanup, {
      slug: `it-state-concurrent-second-${randomUUID()}`,
      status: 'published',
      difficulty: 'medium',
    });
    const sessions = new DrizzlePracticeSessionRepository(db);
    const session = await sessions.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 2,
        tagSlugs: [],
        difficulties: [],
        questionIds: [firstQuestion.id, secondQuestion.id],
      },
    });

    await Promise.all([
      sessions.saveDraftAnswer({
        userId: user.id,
        sessionId: session.id,
        questionId: firstQuestion.id,
        selectedChoiceId: firstQuestion.correctChoiceId,
        cumulativeMs: 10_000,
      }),
      sessions.setQuestionMarkedForReview({
        userId: user.id,
        sessionId: session.id,
        questionId: secondQuestion.id,
        markedForReview: true,
      }),
    ]);

    const updated = await sessions.findByIdAndUserId(session.id, user.id);
    expect(updated?.questionStates).toMatchObject([
      {
        questionId: firstQuestion.id,
        draftSelectedChoiceId: firstQuestion.correctChoiceId,
        draftCumulativeMs: 10_000,
      },
      {
        questionId: secondQuestion.id,
        markedForReview: true,
      },
    ]);

    const [state] = await sql<
      Array<{
        id: string;
        version: number;
      }>
    >`
      SELECT id::text, version
      FROM practice_session_question_states
      WHERE practice_session_id = ${session.id}
        AND question_id = ${firstQuestion.id}
    `;
    if (!state) throw new Error('Missing first question state row');

    const [firstWrite] = await sql<Array<{ id: string }>>`
      UPDATE practice_session_question_states
      SET draft_cumulative_ms = 20000, version = version + 1
      WHERE id = ${state.id} AND version = ${state.version}
      RETURNING id::text
    `;
    const secondWrite = await sql<Array<{ id: string }>>`
      UPDATE practice_session_question_states
      SET draft_cumulative_ms = 30000, version = version + 1
      WHERE id = ${state.id} AND version = ${state.version}
      RETURNING id::text
    `;

    expect(firstWrite).toEqual({ id: state.id });
    expect(secondWrite).toEqual([]);
  });

  it('does not bump version or updated_at for stale draft saves', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-state-stale-draft-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const firstSavedAt = new Date('2026-02-01T00:05:00.000Z');
    const sessions = new DrizzlePracticeSessionRepository(
      db,
      () => firstSavedAt,
    );
    const session = await sessions.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });

    await sessions.saveDraftAnswer({
      userId: user.id,
      sessionId: session.id,
      questionId: question.id,
      selectedChoiceId: question.correctChoiceId,
      cumulativeMs: 45_000,
    });

    const [beforeStale] = await sql<
      Array<{
        version: number;
        updated_at: string;
      }>
    >`
      SELECT version, updated_at
      FROM practice_session_question_states
      WHERE practice_session_id = ${session.id}
        AND question_id = ${question.id}
    `;
    if (!beforeStale) throw new Error('Missing state before stale draft save');

    const staleSessions = new DrizzlePracticeSessionRepository(
      db,
      () => new Date('2026-02-01T00:04:00.000Z'),
    );
    await staleSessions.saveDraftAnswer({
      userId: user.id,
      sessionId: session.id,
      questionId: question.id,
      selectedChoiceId: question.incorrectChoiceId,
      cumulativeMs: 30_000,
    });

    const [afterStale] = await sql<
      Array<{
        draft_selected_choice_id: string | null;
        draft_cumulative_ms: number;
        version: number;
        updated_at: string;
      }>
    >`
      SELECT
        draft_selected_choice_id::text,
        draft_cumulative_ms,
        version,
        updated_at
      FROM practice_session_question_states
      WHERE practice_session_id = ${session.id}
        AND question_id = ${question.id}
    `;

    expect(afterStale).toMatchObject({
      draft_selected_choice_id: question.correctChoiceId,
      draft_cumulative_ms: 45_000,
      version: beforeStale.version,
      updated_at: beforeStale.updated_at,
    });
  });

  it('enforces the draft cumulative-ms bound at the database boundary', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-state-check-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const sessions = new DrizzlePracticeSessionRepository(db);
    const session = await sessions.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });

    await expect(
      db
        .update(schema.practiceSessionQuestionStates)
        .set({ draftCumulativeMs: 86_400_001 })
        .where(
          and(
            eq(
              schema.practiceSessionQuestionStates.practiceSessionId,
              session.id,
            ),
            eq(schema.practiceSessionQuestionStates.questionId, question.id),
          ),
        ),
    ).rejects.toMatchObject({
      cause: {
        code: '23514',
      },
    });
  });

  it('preserves normalized state rows by blocking deletion of referenced questions', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-state-question-fk-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const sessions = new DrizzlePracticeSessionRepository(db);
    await sessions.create({
      userId: user.id,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });

    await expect(
      db.delete(schema.questions).where(eq(schema.questions.id, question.id)),
    ).rejects.toMatchObject({
      cause: {
        code: '23503',
      },
    });
  });
});
