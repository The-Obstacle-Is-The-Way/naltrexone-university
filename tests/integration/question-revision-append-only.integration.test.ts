import { randomUUID } from 'node:crypto';
import { sql as drizzleSql, eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
  currentRevisionIdOf,
} from './helpers';

// ADR-021 phase 2b (migration 0042): a revision and its choices are never
// updated. Changed content is a new revision, whose choices may reuse the
// question's labels and sort orders, and history stays on the revision it
// answered.
const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

async function createPublishedQuestion(label: string) {
  return createQuestion(db, cleanup, {
    slug: `it-append-only-${label}-${randomUUID()}`,
    status: 'published',
    difficulty: 'easy',
  });
}

async function insertRevision(questionId: string, revisionNumber: number) {
  const [revision] = await db
    .insert(schema.questionRevisions)
    .values({
      questionId,
      revisionNumber,
      stemMd: `# Stem, revision ${revisionNumber}`,
      explanationMd: '# Explanation',
      difficulty: 'easy',
      canonicalizationVersion: 'stored-fields-json-v1',
      contentHash: 'b'.repeat(64),
    })
    .returning({ id: schema.questionRevisions.id });
  if (!revision) throw new Error('Failed to insert revision');
  return revision.id;
}

function choiceRow(
  questionId: string,
  questionRevisionId: string,
  label: string,
  sortOrder: number,
) {
  return {
    questionId,
    questionRevisionId,
    label,
    textMd: `Choice ${label}`,
    isCorrect: label === 'A',
    sortOrder,
  };
}

// The database error, whether thrown directly or wrapped by Drizzle.
function databaseError(error: unknown): {
  code: string | null;
  constraint: string | null;
  message: string;
} {
  let current: unknown = error;
  while (current && typeof current === 'object') {
    const candidate = current as {
      code?: unknown;
      constraint_name?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    if (typeof candidate.code === 'string') {
      return {
        code: candidate.code,
        constraint:
          typeof candidate.constraint_name === 'string'
            ? candidate.constraint_name
            : null,
        message: String(candidate.message),
      };
    }
    current = candidate.cause;
  }
  return { code: null, constraint: null, message: String(error) };
}

describe('ADR-021 phase 2b: revisions are append-only', () => {
  it("lets a newer revision reuse its question's choice labels and sort orders", async () => {
    const question = await createPublishedQuestion('reuse');
    const revisionId = await insertRevision(question.id, 2);

    const inserted = await db
      .insert(schema.choices)
      .values([
        choiceRow(question.id, revisionId, 'A', 1),
        choiceRow(question.id, revisionId, 'B', 2),
      ])
      .returning({ id: schema.choices.id });

    expect(inserted).toHaveLength(2);
  });

  it.each([
    ['label', ['A', 'A'], [1, 2], schema.CHOICES_QUESTION_REVISION_ID_LABEL_UQ],
    [
      'sort order',
      ['A', 'B'],
      [1, 1],
      schema.CHOICES_QUESTION_REVISION_ID_SORT_ORDER_UQ,
    ],
  ] as const)(
    'refuses a duplicate %s within one revision',
    async (_name, labels, sortOrders, constraint) => {
      const question = await createPublishedQuestion('duplicate');
      const revisionId = await insertRevision(question.id, 2);

      const error = await db
        .insert(schema.choices)
        .values([
          choiceRow(question.id, revisionId, labels[0], sortOrders[0]),
          choiceRow(question.id, revisionId, labels[1], sortOrders[1]),
        ])
        .catch((caught: unknown) => caught);

      expect(databaseError(error)).toMatchObject({
        code: '23505',
        constraint,
      });
    },
  );

  it('refuses any update to a revision', async () => {
    const question = await createPublishedQuestion('revision-update');
    const revisionId = await currentRevisionIdOf(db, question.id);
    if (!revisionId) throw new Error('no current revision');

    const error = await db
      .update(schema.questionRevisions)
      .set({ stemMd: '# Changed in place' })
      .where(eq(schema.questionRevisions.id, revisionId))
      .catch((caught: unknown) => caught);

    expect(databaseError(error)).toMatchObject({ code: '23001' });
    expect(databaseError(error).message).toContain('immutable');
  });

  it('refuses any update to a choice', async () => {
    const question = await createPublishedQuestion('choice-update');

    const error = await db
      .update(schema.choices)
      .set({ isCorrect: true })
      .where(eq(schema.choices.id, question.incorrectChoiceId))
      .catch((caught: unknown) => caught);

    expect(databaseError(error)).toMatchObject({ code: '23001' });
    expect(databaseError(error).message).toContain('immutable');
  });

  it('still deletes a question with its revisions and choices', async () => {
    const question = await createPublishedQuestion('delete');
    await insertRevision(question.id, 2);

    await db
      .delete(schema.questions)
      .where(eq(schema.questions.id, question.id));

    const [left] = await db.execute<{ revisions: number; choices: number }>(
      drizzleSql`
        SELECT
          (SELECT count(*)::int FROM question_revisions WHERE question_id = ${question.id}) AS revisions,
          (SELECT count(*)::int FROM choices WHERE question_id = ${question.id}) AS choices
      `,
    );
    expect(left).toEqual({ revisions: 0, choices: 0 });
  });

  it('retires the functions that refreshed revision 1 in place', async () => {
    const [row] = await db.execute<{ count: number }>(drizzleSql`
      SELECT count(*)::int AS count FROM pg_proc
      WHERE proname IN (
        'sync_question_revision_v1',
        'sweep_question_revisions_v1',
        'question_content_json_v1',
        'bind_history_revisions_v1'
      )
    `);
    expect(row?.count).toBe(0);
  });
});

describe('ADR-021 phase 2b: every history row and choice is bound', () => {
  async function assertBound() {
    return db
      .execute(drizzleSql`SELECT assert_question_revisions_bound_v1()`)
      .then(() => null)
      .catch((caught: unknown) => databaseError(caught));
  }

  // Since migration 0043 the columns are NOT NULL, so the assertion can no
  // longer see an unbound row; question-revision-contract proves the refusal.
  it('passes when every session state, attempt and choice names its revision', async () => {
    await createPublishedQuestion('bound');

    await expect(assertBound()).resolves.toBeNull();
  });
});
