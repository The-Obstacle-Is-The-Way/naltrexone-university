import { randomUUID } from 'node:crypto';
import { sql as drizzleSql, eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { syncQuestionsFromFiles } from '@/scripts/seed/question-syncer';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
  createUser,
  currentRevisionIdOf,
} from './helpers';
import { source } from './seed-test-helpers';

// ADR-021 phase 3 (migration 0043): every history row, choice and question
// names its revision, and the database refuses one that does not. The legacy
// text columns on questions are no longer written; a later migration drops
// them.
const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

// The database error, whether thrown directly or wrapped by Drizzle.
function databaseError(error: unknown): {
  code: string | null;
  column: string | null;
  constraint: string | null;
} {
  let current: unknown = error;
  while (current && typeof current === 'object') {
    const candidate = current as {
      code?: unknown;
      column_name?: unknown;
      constraint_name?: unknown;
      cause?: unknown;
    };
    if (typeof candidate.code === 'string') {
      return {
        code: candidate.code,
        column:
          typeof candidate.column_name === 'string'
            ? candidate.column_name
            : null,
        constraint:
          typeof candidate.constraint_name === 'string'
            ? candidate.constraint_name
            : null,
      };
    }
    current = candidate.cause;
  }
  return { code: null, column: null, constraint: null };
}

async function createPublishedQuestion(label: string) {
  return createQuestion(db, cleanup, {
    slug: `it-contract-${label}-${randomUUID()}`,
    status: 'published',
    difficulty: 'easy',
  });
}

describe('ADR-021 phase 3: every row names its revision', () => {
  it('refuses an attempt with no revision', async () => {
    const question = await createPublishedQuestion('attempt');
    const user = await createUser(db, cleanup);

    const error = await sql`
      INSERT INTO attempts (user_id, question_id, selected_choice_id, is_correct, time_spent_seconds)
      VALUES (${user.id}, ${question.id}, ${question.correctChoiceId}, true, 1)
    `.catch((caught: unknown) => caught);

    expect(databaseError(error)).toMatchObject({
      code: '23502',
      column: 'question_revision_id',
    });
  });

  it('refuses a choice with no revision', async () => {
    const question = await createPublishedQuestion('choice');

    const error = await sql`
      INSERT INTO choices (question_id, label, text_md, is_correct, sort_order)
      VALUES (${question.id}, 'E', 'Unbound', false, 5)
    `.catch((caught: unknown) => caught);

    expect(databaseError(error)).toMatchObject({
      code: '23502',
      column: 'question_revision_id',
    });
  });

  it('refuses a question with no current revision', async () => {
    const question = await createPublishedQuestion('pointer');

    const error = await sql`
      UPDATE questions SET current_revision_id = NULL WHERE id = ${question.id}
    `.catch((caught: unknown) => caught);

    expect(databaseError(error)).toMatchObject({
      code: '23502',
      column: 'current_revision_id',
    });
  });

  it('refuses a session item with no revision', async () => {
    const question = await createPublishedQuestion('state');
    const user = await createUser(db, cleanup);
    const session = await new DrizzlePracticeSessionRepository(db).create({
      userId: user.id,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });

    const error = await sql`
      UPDATE practice_session_question_states
      SET question_revision_id = NULL
      WHERE practice_session_id = ${session.id}
    `.catch((caught: unknown) => caught);

    expect(databaseError(error)).toMatchObject({
      code: '23502',
      column: 'question_revision_id',
    });
  });
  it('refuses to create a session over a question that does not exist', async () => {
    const user = await createUser(db, cleanup);

    await expect(
      new DrizzlePracticeSessionRepository(db).create({
        userId: user.id,
        mode: 'tutor',
        paramsJson: {
          count: 1,
          tagSlugs: [],
          difficulties: [],
          questionIds: [randomUUID()],
        },
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});

describe('ADR-021 phase 3: a question and its first revision point at each other', () => {
  it('writes both in one transaction, the pointer checked at commit', async () => {
    const questionId = randomUUID();
    const revisionId = randomUUID();

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO questions (id, slug, status, current_revision_id)
        VALUES (${questionId}, ${`it-contract-pair-${randomUUID()}`}, 'draft', ${revisionId})
      `;
      await tx`
        INSERT INTO question_revisions (id, question_id, revision_number, stem_md, explanation_md, difficulty, canonicalization_version, content_hash)
        VALUES (${revisionId}, ${questionId}, 1, '# Stem', '# Explanation', 'easy', 'stored-fields-json-v1', ${'c'.repeat(64)})
      `;
    });
    cleanup.questionIds.push(questionId);

    await expect(currentRevisionIdOf(db, questionId)).resolves.toBe(revisionId);
  });

  it('refuses at commit a pointer to a revision that was never written', async () => {
    const error = await sql
      .begin(async (tx) => {
        await tx`
          INSERT INTO questions (slug, status, current_revision_id)
          VALUES (${`it-contract-dangling-${randomUUID()}`}, 'draft', ${randomUUID()})
        `;
      })
      .catch((caught: unknown) => caught);

    expect(databaseError(error)).toMatchObject({
      code: '23503',
      constraint: schema.QUESTIONS_CURRENT_REVISION_FK,
    });
  });
});

describe('ADR-021 phase 3: content lives only in revisions', () => {
  it('has no legacy text columns on questions', async () => {
    const columns = await db.execute<{ column_name: string }>(drizzleSql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'questions'
    `);

    expect(columns.map((column) => column.column_name)).not.toEqual(
      expect.arrayContaining(['stem_md']),
    );
    expect(columns.map((column) => column.column_name).sort()).toEqual(
      [
        'created_at',
        'current_revision_id',
        'id',
        'slug',
        'status',
        'updated_at',
      ].sort(),
    );
  });

  it('seeds a question whose content lives only in its revision', async () => {
    const slug = `it-contract-seed-${randomUUID()}`;
    await syncQuestionsFromFiles(db, [source(slug)]);
    const [row] = await db
      .select({ id: schema.questions.id })
      .from(schema.questions)
      .where(eq(schema.questions.slug, slug));
    if (!row) throw new Error('seed did not insert the question');
    cleanup.questionIds.push(row.id);

    await expect(currentRevisionIdOf(db, row.id)).resolves.toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });
});
