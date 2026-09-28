import { randomUUID } from 'node:crypto';
import { asc, sql as drizzleSql, eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import {
  canonicalQuestionRevisionJson,
  type QuestionRevisionFields,
  questionRevisionContentHash,
} from '@/lib/content/question-revision-hash';
import { syncQuestionsFromFiles } from '@/scripts/seed/question-syncer';
import { NobleSha256Hasher } from '@/src/adapters/gateways/noble-sha256-hasher';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
} from './helpers';

// ADR-021 phase 1: each question's revision 1 mirrors its legacy row, in the
// stored-fields-json-v1 form. These cases prove the SQL form (migration 0039)
// is byte-identical to the reference implementation, and that the mirror is
// created, refreshed and attached as the parallel change requires.
const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();
const hasher = new NobleSha256Hasher();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

async function syncRevision(questionId: string): Promise<string> {
  const [row] = await sql<{ outcome: string }[]>`
    SELECT sync_question_revision_v1(${questionId}::uuid) AS outcome
  `;
  if (!row) throw new Error('sync_question_revision_v1 returned no row');
  return row.outcome;
}

async function sqlContentJson(questionId: string): Promise<string | null> {
  const [row] = await sql<{ json: string | null }[]>`
    SELECT question_content_json_v1(${questionId}::uuid) AS json
  `;
  return row?.json ?? null;
}

async function legacyFields(
  questionId: string,
): Promise<QuestionRevisionFields> {
  const question = await db.query.questions.findFirst({
    where: eq(schema.questions.id, questionId),
  });
  if (!question) throw new Error('question not found');
  const choices = await db
    .select()
    .from(schema.choices)
    .where(eq(schema.choices.questionId, questionId))
    .orderBy(asc(schema.choices.sortOrder));
  return {
    stemMd: question.stemMd,
    explanationMd: question.explanationMd,
    referenceMd: question.referenceMd,
    difficulty: question.difficulty,
    choices: choices.map((choice) => ({
      label: choice.label,
      sortOrder: choice.sortOrder,
      textMd: choice.textMd,
      isCorrect: choice.isCorrect,
      explanationMd: choice.explanationMd,
    })),
  };
}

async function revisionsOf(questionId: string) {
  return db
    .select()
    .from(schema.questionRevisions)
    .where(eq(schema.questionRevisions.questionId, questionId));
}

async function insertHardQuestion(): Promise<string> {
  const [question] = await db
    .insert(schema.questions)
    .values({
      slug: `adr021-hard-${randomUUID()}`,
      stemMd:
        'Quote " backslash \\ newline\ntab\tcontrol\u0001 é 😀 line sep </script> a/b',
      explanationMd: '**Bold** and `code`\r\nCRLF\b\f',
      referenceMd: null,
      difficulty: 'hard',
      status: 'published',
    })
    .returning({ id: schema.questions.id });
  if (!question) throw new Error('Failed to insert question');
  cleanup.questionIds.push(question.id);
  await db.insert(schema.choices).values([
    {
      questionId: question.id,
      label: 'B',
      sortOrder: 2,
      textMd: '\u001f unit separator',
      isCorrect: false,
      explanationMd: 'Wrong: "quoted" \\ reason',
    },
    {
      questionId: question.id,
      label: 'A',
      sortOrder: 1,
      textMd: 'Right answer',
      isCorrect: true,
      explanationMd: null,
    },
  ]);
  return question.id;
}

describe('stored-fields-json-v1 in SQL', () => {
  it('escapes hard strings exactly as the reference implementation does', async () => {
    const questionId = await insertHardQuestion();

    const fields = await legacyFields(questionId);
    expect(await sqlContentJson(questionId)).toBe(
      canonicalQuestionRevisionJson(fields),
    );
  });

  // The seeded corpus when present, and always one hard question of the
  // test's own, so the check never passes vacuously on an empty database.
  async function corpusQuestionIds(): Promise<string[]> {
    await insertHardQuestion();
    await sql`SELECT sweep_question_revisions_v1()`;
    const questions = await db
      .select({ id: schema.questions.id })
      .from(schema.questions);
    return questions.map(({ id }) => id);
  }

  it('serializes every question in the corpus exactly as the reference implementation does', async () => {
    const mismatches: string[] = [];
    for (const questionId of await corpusQuestionIds()) {
      const expected = canonicalQuestionRevisionJson(
        await legacyFields(questionId),
      );
      if ((await sqlContentJson(questionId)) !== expected) {
        mismatches.push(questionId);
      }
    }

    expect(mismatches).toEqual([]);
  });

  it('stores the reference hash for every question in the corpus', async () => {
    const questionIds = await corpusQuestionIds();
    const revisions = new Map(
      (await db.select().from(schema.questionRevisions)).map((revision) => [
        revision.id,
        revision,
      ]),
    );
    const mismatches: string[] = [];
    for (const questionId of questionIds) {
      const question = await db.query.questions.findFirst({
        where: eq(schema.questions.id, questionId),
      });
      const revision = question?.currentRevisionId
        ? revisions.get(question.currentRevisionId)
        : undefined;
      const expected = questionRevisionContentHash(
        await legacyFields(questionId),
        hasher,
      );
      if (revision?.contentHash !== expected) mismatches.push(questionId);
    }

    expect(mismatches).toEqual([]);
  });
});

describe('sync_question_revision_v1', () => {
  it('creates the mirror revision and attaches every choice', async () => {
    const questionId = await insertHardQuestion();

    await expect(syncRevision(questionId)).resolves.toBe('created');

    const [revision, ...others] = await revisionsOf(questionId);
    expect(others).toEqual([]);
    const fields = await legacyFields(questionId);
    expect(revision).toMatchObject({
      revisionNumber: 1,
      stemMd: fields.stemMd,
      explanationMd: fields.explanationMd,
      referenceMd: null,
      difficulty: 'hard',
      canonicalizationVersion: 'stored-fields-json-v1',
      contentHash: questionRevisionContentHash(fields, hasher),
    });
    const question = await db.query.questions.findFirst({
      where: eq(schema.questions.id, questionId),
    });
    expect(question?.currentRevisionId).toBe(revision?.id);
    const choices = await db
      .select({ questionRevisionId: schema.choices.questionRevisionId })
      .from(schema.choices)
      .where(eq(schema.choices.questionId, questionId));
    expect(choices.map((choice) => choice.questionRevisionId)).toEqual([
      revision?.id,
      revision?.id,
    ]);
  });

  it('refreshes the mirror when another writer changed the legacy row', async () => {
    const question = await createQuestion(db, cleanup, {
      slug: `adr021-refresh-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    await syncRevision(question.id);
    await db
      .update(schema.questions)
      .set({ stemMd: 'Rewritten in place by an older writer.' })
      .where(eq(schema.questions.id, question.id));

    await expect(syncRevision(question.id)).resolves.toBe('refreshed');

    const revisions = await revisionsOf(question.id);
    const fields = await legacyFields(question.id);
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({
      revisionNumber: 1,
      stemMd: 'Rewritten in place by an older writer.',
      contentHash: questionRevisionContentHash(fields, hasher),
    });
    await expect(syncRevision(question.id)).resolves.toBe('unchanged');
  });

  it('attaches a choice another writer added later', async () => {
    const question = await createQuestion(db, cleanup, {
      slug: `adr021-attach-${randomUUID()}`,
      status: 'published',
      difficulty: 'medium',
    });
    await syncRevision(question.id);
    await db.insert(schema.choices).values({
      questionId: question.id,
      label: 'Z',
      sortOrder: 26,
      textMd: 'Added later',
      isCorrect: false,
      explanationMd: 'Added later, wrong.',
    });

    await expect(syncRevision(question.id)).resolves.toBe('refreshed');

    const unattached = await db
      .select({ id: schema.choices.id })
      .from(schema.choices)
      .where(
        drizzleSql`${schema.choices.questionId} = ${question.id} AND ${schema.choices.questionRevisionId} IS NULL`,
      );
    expect(unattached).toEqual([]);
  });

  it('refuses a question that does not exist', async () => {
    await expect(syncRevision(randomUUID())).rejects.toMatchObject({
      code: 'P0002',
    });
  });
});

describe('question revision keys', () => {
  it("refuses a choice attached to another question's revision", async () => {
    const first = await createQuestion(db, cleanup, {
      slug: `adr021-key-a-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const second = await createQuestion(db, cleanup, {
      slug: `adr021-key-b-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    await syncRevision(first.id);
    await syncRevision(second.id);
    const [secondRevision] = await revisionsOf(second.id);

    await expect(
      db
        .update(schema.choices)
        .set({ questionRevisionId: secondRevision?.id })
        .where(eq(schema.choices.id, first.correctChoiceId)),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({
        code: '23503',
        constraint_name: schema.CHOICES_QUESTION_REVISION_FK,
      }),
    });
  });

  it('deletes a question together with its revisions and choices', async () => {
    const question = await createQuestion(db, cleanup, {
      slug: `adr021-delete-${randomUUID()}`,
      status: 'draft',
      difficulty: 'easy',
    });
    await syncRevision(question.id);

    await db
      .delete(schema.questions)
      .where(eq(schema.questions.id, question.id));

    await expect(revisionsOf(question.id)).resolves.toEqual([]);
  });
});

function seedFile(slug: string, stem: string) {
  return {
    absolutePath: `/tmp/${slug}.mdx`,
    raw: [
      '---',
      `slug: ${slug}`,
      'difficulty: easy',
      'status: published',
      'tags:',
      '  - slug: general',
      '    name: General',
      '    kind: topic',
      '  - slug: alcohol',
      '    name: Alcohol',
      '    kind: substance',
      'choices:',
      '  - label: A',
      '    text: Choice A',
      '    correct: true',
      '  - label: B',
      '    text: Choice B',
      '    correct: false',
      '    explanation: Choice B is not correct.',
      '---',
      '',
      '## Stem',
      '',
      stem,
      '',
      '## Explanation',
      '',
      '# Explanation',
      '',
      '### Reference',
      '',
      'Synthetic test citation.',
    ].join('\n'),
  };
}

// The seed creates any tag it does not find. Only the tags a call created
// are removed afterwards, so a seeded corpus keeps its own.
async function seedQuestion(slug: string, stem: string): Promise<string> {
  const tagsBefore = new Set(
    (await db.select({ id: schema.tags.id }).from(schema.tags)).map(
      ({ id }) => id,
    ),
  );
  await syncQuestionsFromFiles(db, [seedFile(slug, stem)]);
  for (const { id } of await db
    .select({ id: schema.tags.id })
    .from(schema.tags)) {
    if (!tagsBefore.has(id) && !cleanup.tagIds.includes(id)) {
      cleanup.tagIds.push(id);
    }
  }
  const question = await db.query.questions.findFirst({
    where: eq(schema.questions.slug, slug),
  });
  if (!question) throw new Error('seeded question not found');
  if (!cleanup.questionIds.includes(question.id)) {
    cleanup.questionIds.push(question.id);
  }
  return question.id;
}

async function expectFaithfulMirror(questionId: string): Promise<void> {
  const question = await db.query.questions.findFirst({
    where: eq(schema.questions.id, questionId),
  });
  const revisions = await revisionsOf(questionId);
  const fields = await legacyFields(questionId);
  expect(revisions).toHaveLength(1);
  expect(revisions[0]?.id).toBe(question?.currentRevisionId);
  expect(revisions[0]?.contentHash).toBe(
    questionRevisionContentHash(fields, hasher),
  );
  const unattached = await db
    .select({ id: schema.choices.id })
    .from(schema.choices)
    .where(
      drizzleSql`${schema.choices.questionId} = ${questionId} AND ${schema.choices.questionRevisionId} IS DISTINCT FROM ${question?.currentRevisionId}`,
    );
  expect(unattached).toEqual([]);
}

describe('the seed keeps the mirror', () => {
  it('gives a new question its mirror revision', async () => {
    const questionId = await seedQuestion(
      `adr021-seed-new-${randomUUID()}`,
      'A new stem.',
    );

    await expectFaithfulMirror(questionId);
  });

  it('refreshes the mirror when it rewrites a question', async () => {
    const slug = `adr021-seed-rewrite-${randomUUID()}`;
    await seedQuestion(slug, 'The first stem.');

    const questionId = await seedQuestion(slug, 'The rewritten stem.');

    await expectFaithfulMirror(questionId);
    const [revision] = await revisionsOf(questionId);
    expect(revision?.stemMd).toContain('The rewritten stem.');
  });

  it('restores a missing pointer even when the content is unchanged', async () => {
    const slug = `adr021-seed-skip-${randomUUID()}`;
    const questionId = await seedQuestion(slug, 'An unchanged stem.');
    await db
      .update(schema.questions)
      .set({ currentRevisionId: null })
      .where(eq(schema.questions.id, questionId));

    await seedQuestion(slug, 'An unchanged stem.');

    await expectFaithfulMirror(questionId);
  });

  it('mirrors a question an older writer created when it rewrites it', async () => {
    const slug = `adr021-seed-legacy-${randomUUID()}`;
    await createQuestion(db, cleanup, {
      slug,
      status: 'published',
      difficulty: 'easy',
    });

    const questionId = await seedQuestion(slug, 'Rewritten by the seed.');

    await expectFaithfulMirror(questionId);
  });
});
