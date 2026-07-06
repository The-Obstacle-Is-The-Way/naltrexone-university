import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { parsePracticeSessionParamsJson } from '@/src/adapters/repositories/practice-session-params';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
  createUser,
} from './helpers';
import { readDebt428434CleanupSql } from './practice-session-state-backfill-helper';

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

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

describe('practice session params_json cleanup', () => {
  it('blocks new string params_json rows and strips stale questionStates idempotently', async () => {
    const user = await createUser(db, cleanup);
    const firstQuestion = await createQuestion(db, cleanup, {
      slug: `it-state-cleanup-first-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const secondQuestion = await createQuestion(db, cleanup, {
      slug: `it-state-cleanup-second-${randomUUID()}`,
      status: 'published',
      difficulty: 'medium',
    });

    const doubleEncodedParamsJson: schema.PracticeSessionParams = {
      count: 1,
      tagSlugs: [],
      difficulties: [],
      questionIds: [firstQuestion.id],
    };
    const objectParamsJson: LegacyPracticeSessionParams = {
      count: 1,
      tagSlugs: [],
      difficulties: [],
      questionIds: [secondQuestion.id],
      questionStates: [
        {
          questionId: secondQuestion.id,
          markedForReview: true,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: null,
          draftSavedAt: null,
          draftCumulativeMs: 0,
        },
      ],
    };
    const untouchedParamsJson: schema.PracticeSessionParams = {
      count: 1,
      tagSlugs: ['opioids'],
      difficulties: ['easy'],
      questionIds: [firstQuestion.id],
    };

    await expect(sql`
      INSERT INTO practice_sessions (user_id, mode, params_json, ended_at)
      VALUES (
        ${user.id},
        'tutor',
        to_jsonb(${JSON.stringify(doubleEncodedParamsJson)}::text),
        '2026-01-01T00:02:00.000Z'::timestamptz
      )
    `).rejects.toThrow();

    const [staleObjectSession, untouchedSession] = await db
      .insert(schema.practiceSessions)
      .values([
        {
          userId: user.id,
          mode: 'exam',
          paramsJson:
            objectParamsJson as unknown as schema.PracticeSessionParams,
          endedAt: new Date('2026-01-01T00:03:00.000Z'),
        },
        {
          userId: user.id,
          mode: 'tutor',
          paramsJson: untouchedParamsJson,
          endedAt: new Date('2026-01-01T00:04:00.000Z'),
        },
      ])
      .returning({ id: schema.practiceSessions.id });

    if (!staleObjectSession || !untouchedSession) {
      throw new Error('Failed to insert cleanup sessions');
    }

    const [untouchedBefore] = await sql<Array<{ params_json: string }>>`
      SELECT params_json::text
      FROM practice_sessions
      WHERE id = ${untouchedSession.id}
    `;
    if (!untouchedBefore) throw new Error('Missing untouched session');

    const cleanupSql = readDebt428434CleanupSql();
    await sql.unsafe(cleanupSql);
    await sql.unsafe(cleanupSql);

    const rows = await sql<
      Array<{
        id: string;
        params_json: unknown;
        params_json_text: string;
        params_type: string;
        has_question_states: boolean;
      }>
    >`
      SELECT
        id::text,
        params_json,
        params_json::text AS params_json_text,
        jsonb_typeof(params_json) AS params_type,
        params_json ? 'questionStates' AS has_question_states
      FROM practice_sessions
      WHERE id IN (${staleObjectSession.id}, ${untouchedSession.id})
      ORDER BY id
    `;
    const rowsById = new Map(rows.map((row) => [row.id, row]));

    const strippedObjectRow = rowsById.get(staleObjectSession.id);
    const untouchedRow = rowsById.get(untouchedSession.id);
    if (!strippedObjectRow || !untouchedRow) {
      throw new Error('Missing cleanup result rows');
    }

    expect(strippedObjectRow.has_question_states).toBe(false);
    expect(
      parsePracticeSessionParamsJson(
        strippedObjectRow.params_json,
        'INTERNAL_ERROR',
      ),
    ).toEqual({
      count: 1,
      tagSlugs: [],
      difficulties: [],
      questionIds: [secondQuestion.id],
    });
    expect(untouchedRow.params_json_text).toBe(untouchedBefore.params_json);
  });
});
