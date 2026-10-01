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
import { readDebt425BackfillSql } from './marked-migration-sql-test-helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

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

  it('fails loudly when a DEBT-425 backfill block has no end marker', () => {
    const migrationsDir = mkdtempSync(join(tmpdir(), 'debt-425-backfill-'));
    try {
      writeFileSync(
        join(migrationsDir, '0001_broken.sql'),
        '-- DEBT-425 backfill:start\nSELECT 1;',
      );

      expect(() => readDebt425BackfillSql(migrationsDir)).toThrow(
        'Malformed DEBT-425 marked backfill migration block in 0001_broken.sql',
      );
    } finally {
      rmSync(migrationsDir, { recursive: true, force: true });
    }
  });

  it('fails loudly when a DEBT-425 backfill end marker appears first', () => {
    const migrationsDir = mkdtempSync(join(tmpdir(), 'debt-425-backfill-'));
    try {
      writeFileSync(
        join(migrationsDir, '0001_broken.sql'),
        '-- DEBT-425 backfill:end\nSELECT 1;',
      );

      expect(() => readDebt425BackfillSql(migrationsDir)).toThrow(
        'Malformed DEBT-425 marked backfill migration block in 0001_broken.sql',
      );
    } finally {
      rmSync(migrationsDir, { recursive: true, force: true });
    }
  });

  it('fails loudly when multiple DEBT-425 backfill blocks are marked', () => {
    const migrationsDir = mkdtempSync(join(tmpdir(), 'debt-425-backfill-'));
    const markedBlock = [
      '-- DEBT-425 backfill:start',
      'SELECT 1;',
      '-- DEBT-425 backfill:end',
    ].join('\n');
    try {
      writeFileSync(join(migrationsDir, '0001_first.sql'), markedBlock);
      writeFileSync(join(migrationsDir, '0002_second.sql'), markedBlock);

      expect(() => readDebt425BackfillSql(migrationsDir)).toThrow(
        'Expected exactly one DEBT-425 marked backfill migration block, found 2',
      );
    } finally {
      rmSync(migrationsDir, { recursive: true, force: true });
    }
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

  it('rejects selected choices from a different question at the database boundary', async () => {
    const user = await createUser(db, cleanup);
    const firstQuestion = await createQuestion(db, cleanup, {
      slug: `it-state-choice-fk-first-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const secondQuestion = await createQuestion(db, cleanup, {
      slug: `it-state-choice-fk-second-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const sessions = new DrizzlePracticeSessionRepository(db);
    const session = await sessions.create({
      userId: user.id,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [firstQuestion.id],
      },
    });

    await expect(
      db
        .update(schema.practiceSessionQuestionStates)
        .set({
          latestSelectedChoiceId: secondQuestion.correctChoiceId,
          latestIsCorrect: true,
          latestAnsweredAt: new Date('2026-02-01T00:10:00.000Z'),
        })
        .where(
          and(
            eq(
              schema.practiceSessionQuestionStates.practiceSessionId,
              session.id,
            ),
            eq(
              schema.practiceSessionQuestionStates.questionId,
              firstQuestion.id,
            ),
          ),
        ),
    ).rejects.toMatchObject({
      cause: {
        code: '23503',
      },
    });
  });

  it('rejects answered choice state without correctness and answer timestamp metadata', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-state-latest-consistency-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const sessions = new DrizzlePracticeSessionRepository(db);
    const session = await sessions.create({
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
      db
        .update(schema.practiceSessionQuestionStates)
        .set({ latestSelectedChoiceId: question.correctChoiceId })
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

  it('allows omitted finalized state without a selected latest choice', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-state-omitted-consistency-${randomUUID()}`,
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
    const answeredAt = new Date('2026-02-01T00:12:00.000Z');

    await expect(
      db
        .update(schema.practiceSessionQuestionStates)
        .set({
          latestSelectedChoiceId: null,
          latestIsCorrect: false,
          latestAnsweredAt: answeredAt,
        })
        .where(
          and(
            eq(
              schema.practiceSessionQuestionStates.practiceSessionId,
              session.id,
            ),
            eq(schema.practiceSessionQuestionStates.questionId, question.id),
          ),
        ),
    ).resolves.toBeDefined();
  });

  it('rejects omitted finalized state marked correct', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-state-omitted-correct-${randomUUID()}`,
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
        .set({
          latestSelectedChoiceId: null,
          latestIsCorrect: true,
          latestAnsweredAt: new Date('2026-02-01T00:12:00.000Z'),
        })
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

  it('rejects selected draft choice state without a draft save timestamp', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-state-draft-consistency-${randomUUID()}`,
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
        .set({ draftSelectedChoiceId: question.correctChoiceId })
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

  it('rejects positive draft time without a draft save timestamp', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-state-draft-time-consistency-${randomUUID()}`,
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
        .set({ draftCumulativeMs: 1 })
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
