import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import {
  type QuestionRevisionFields,
  questionRevisionContentHash,
} from '@/lib/content/question-revision-hash';
import { appendQuestionRevision } from '@/scripts/seed/question-revision-writer';
import { syncQuestionsFromFiles } from '@/scripts/seed/question-syncer';
import { NobleSha256Hasher } from '@/src/adapters/gateways/noble-sha256-hasher';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
} from './helpers';
import { source } from './seed-test-helpers';

// ADR-021: every revision stores its content hash in the stored-fields-json-v1
// form. Revision 1 of each question was first written by migration 0039's SQL
// form; from phase 2b every revision is written by the seed's TypeScript form.
// These cases prove the stored hashes agree with the reference implementation
// over the stored rows, and that the legacy columns mirror the current
// revision until the contract phase drops them.
const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();
const hasher = new NobleSha256Hasher();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

async function revisionFields(
  revisionId: string,
): Promise<QuestionRevisionFields & { contentHash: string }> {
  const revision = await db.query.questionRevisions.findFirst({
    where: eq(schema.questionRevisions.id, revisionId),
    with: { choices: { orderBy: asc(schema.choices.sortOrder) } },
  });
  if (!revision) throw new Error(`no revision ${revisionId}`);
  return {
    contentHash: revision.contentHash,
    stemMd: revision.stemMd,
    explanationMd: revision.explanationMd,
    referenceMd: revision.referenceMd,
    difficulty: revision.difficulty,
    choices: revision.choices.map((choice) => ({
      label: choice.label,
      sortOrder: choice.sortOrder,
      textMd: choice.textMd,
      isCorrect: choice.isCorrect,
      explanationMd: choice.explanationMd,
    })),
  };
}

// A question whose content exercises JSON escaping, written as the seed
// writes it.
async function insertHardQuestion(): Promise<string> {
  const [question] = await db
    .insert(schema.questions)
    .values({
      slug: `adr021-hard-${randomUUID()}`,
      stemMd: '',
      explanationMd: '',
      difficulty: 'hard',
      status: 'published',
    })
    .returning({ id: schema.questions.id });
  if (!question) throw new Error('Failed to insert question');
  cleanup.questionIds.push(question.id);
  await appendQuestionRevision(db, question.id, {
    stemMd:
      'Quote " backslash \\ newline\ntab\tcontrol\u0001 é 😀 line sep </script> a/b',
    explanationMd: '**Bold** and `code`\r\nCRLF\b\f',
    referenceMd: null,
    difficulty: 'hard',
    choices: [
      {
        label: 'A',
        sortOrder: 1,
        textMd: 'Right answer',
        isCorrect: true,
        explanationMd: null,
      },
      {
        label: 'B',
        sortOrder: 2,
        textMd: '\u001f unit separator',
        isCorrect: false,
        explanationMd: 'Wrong: "quoted" \\ reason',
      },
    ],
  });
  return question.id;
}

// The seeded corpus when present, and always one hard question of the
// test's own, so the check never passes vacuously on an empty database.
async function corpus() {
  await insertHardQuestion();
  return db
    .select({
      id: schema.questions.id,
      currentRevisionId: schema.questions.currentRevisionId,
      stemMd: schema.questions.stemMd,
      explanationMd: schema.questions.explanationMd,
      referenceMd: schema.questions.referenceMd,
      difficulty: schema.questions.difficulty,
    })
    .from(schema.questions);
}

describe('stored-fields-json-v1 hashes', () => {
  it('stores the reference hash of its own rows in every current revision', async () => {
    const mismatches: string[] = [];
    for (const question of await corpus()) {
      if (!question.currentRevisionId) {
        mismatches.push(question.id);
        continue;
      }
      const { contentHash, ...fields } = await revisionFields(
        question.currentRevisionId,
      );
      if (contentHash !== questionRevisionContentHash(fields, hasher)) {
        mismatches.push(question.id);
      }
    }

    expect(mismatches).toEqual([]);
  });

  it("mirrors every question's current revision into its legacy columns", async () => {
    const mismatches: string[] = [];
    for (const question of await corpus()) {
      if (!question.currentRevisionId) continue;
      const fields = await revisionFields(question.currentRevisionId);
      if (
        question.stemMd !== fields.stemMd ||
        question.explanationMd !== fields.explanationMd ||
        question.referenceMd !== fields.referenceMd ||
        question.difficulty !== fields.difficulty
      ) {
        mismatches.push(question.id);
      }
    }

    expect(mismatches).toEqual([]);
  });
});

describe('question revision keys', () => {
  it("refuses a choice of another question's revision", async () => {
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
    const [secondRevision] = await db
      .select({ id: schema.questionRevisions.id })
      .from(schema.questionRevisions)
      .where(eq(schema.questionRevisions.questionId, second.id));

    await expect(
      db.insert(schema.choices).values({
        questionId: first.id,
        questionRevisionId: secondRevision?.id,
        label: 'E',
        textMd: 'Misattached',
        isCorrect: false,
        sortOrder: 5,
      }),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({
        code: '23503',
        constraint_name: schema.CHOICES_QUESTION_REVISION_FK,
      }),
    });
  });
});

describe('the seed writes revision 1 of a new question', () => {
  it('with its choices, its hash and the question pointing at it', async () => {
    const slug = `adr021-seed-new-${randomUUID()}`;
    await syncQuestionsFromFiles(db, [source(slug)]);
    const question = await db.query.questions.findFirst({
      where: eq(schema.questions.slug, slug),
    });
    if (!question?.currentRevisionId) throw new Error('no current revision');
    cleanup.questionIds.push(question.id);

    const revision = await db.query.questionRevisions.findFirst({
      where: eq(schema.questionRevisions.id, question.currentRevisionId),
    });
    const { contentHash, ...fields } = await revisionFields(
      question.currentRevisionId,
    );
    expect(revision?.revisionNumber).toBe(1);
    expect(fields.choices.map((choice) => choice.label)).toEqual([
      'A',
      'B',
      'C',
    ]);
    expect(contentHash).toBe(questionRevisionContentHash(fields, hasher));
  });
});
