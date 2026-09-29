import { randomUUID } from 'node:crypto';
import { asc, eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { DrizzleQuestionRepository } from '@/src/adapters/repositories/drizzle-question-repository';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
} from './helpers';

// ADR-021 phase 2a, third increment (3a): the question repository reads a
// question's content and choices from its current revision, not from the
// legacy columns or from every choice of the question. While each question
// has one revision, the two are equal; the corpus case proves it.
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
    slug: `it-revision-reads-${label}-${randomUUID()}`,
    status: 'published',
    difficulty: 'easy',
  });
}

async function currentRevisionId(questionId: string) {
  const [row] = await db
    .select({ id: schema.questions.currentRevisionId })
    .from(schema.questions)
    .where(eq(schema.questions.id, questionId));
  return String(row?.id);
}

// A second revision with its own choices, made current, as phase 2b will.
async function makeSecondRevisionCurrent(questionId: string) {
  const [revision] = await db
    .insert(schema.questionRevisions)
    .values({
      questionId,
      revisionNumber: 2,
      stemMd: '# Revised stem',
      explanationMd: '# Revised explanation',
      referenceMd: 'Revised reference',
      difficulty: 'hard',
      canonicalizationVersion: 'stored-fields-json-v1',
      contentHash: 'd'.repeat(64),
    })
    .returning({ id: schema.questionRevisions.id });
  await db.insert(schema.choices).values([
    {
      questionId,
      questionRevisionId: revision?.id,
      label: 'C',
      textMd: 'Revised C',
      isCorrect: false,
      sortOrder: 3,
    },
    {
      questionId,
      questionRevisionId: revision?.id,
      label: 'D',
      textMd: 'Revised D',
      isCorrect: true,
      sortOrder: 4,
    },
  ]);
  await db
    .update(schema.questions)
    .set({ currentRevisionId: revision?.id })
    .where(eq(schema.questions.id, questionId));
}

describe('ADR-021 phase 2a: question content reads through the current revision', () => {
  it("reads the stem, explanation, reference and difficulty from the question's current revision", async () => {
    const question = await createPublishedQuestion('content');
    await db
      .update(schema.questionRevisions)
      .set({
        stemMd: '# Stem from the revision',
        explanationMd: '# Explanation from the revision',
        referenceMd: 'Reference from the revision',
        difficulty: 'hard',
      })
      .where(
        eq(schema.questionRevisions.id, await currentRevisionId(question.id)),
      );

    const read = await new DrizzleQuestionRepository(db).findPublishedById(
      question.id,
    );

    expect(read).toMatchObject({
      stemMd: '# Stem from the revision',
      explanationMd: '# Explanation from the revision',
      referenceMd: 'Reference from the revision',
      difficulty: 'hard',
    });
  });

  it("reads only the current revision's choices", async () => {
    const question = await createPublishedQuestion('choices');
    await makeSecondRevisionCurrent(question.id);
    const repository = new DrizzleQuestionRepository(db);

    for (const read of [
      await repository.findPublishedById(question.id),
      await repository.findPublishedBySlug(question.slug),
      (await repository.findPublishedByIds([question.id]))[0],
      await repository.findByIdForSession(question.id),
      (await repository.findByIdsForSession([question.id]))[0],
    ]) {
      expect(read?.stemMd).toBe('# Revised stem');
      expect(read?.choices.map((choice) => choice.label)).toEqual(['C', 'D']);
    }
  });

  it("filters selection by the current revision's difficulty", async () => {
    // Created easy; the current revision is hard.
    const question = await createPublishedQuestion('difficulty');
    await makeSecondRevisionCurrent(question.id);
    const repository = new DrizzleQuestionRepository(db);
    const hard = { tagSlugs: [], difficulties: ['hard' as const] };
    const easy = { tagSlugs: [], difficulties: ['easy' as const] };

    const hardIds = await repository.listPublishedCandidateIds(hard);
    const easyIds = await repository.listPublishedCandidateIds(easy);

    expect(hardIds).toContain(question.id);
    expect(easyIds).not.toContain(question.id);
    await expect(repository.countPublishedCandidateIds(hard)).resolves.toBe(
      hardIds.length,
    );
  });

  it('refuses to read a question that has no current revision', async () => {
    // Only the seed writes questions, and it mirrors each one in the same
    // transaction, so this is a broken invariant, not a state to serve.
    const question = await createPublishedQuestion('unmirrored');
    await db
      .update(schema.questions)
      .set({ currentRevisionId: null })
      .where(eq(schema.questions.id, question.id));

    await expect(
      new DrizzleQuestionRepository(db).findPublishedById(question.id),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('reads every published question exactly as its legacy columns while each has one revision', async () => {
    const published = await db
      .select()
      .from(schema.questions)
      .where(eq(schema.questions.status, 'published'));
    // An empty corpus would make every comparison below vacuous.
    expect(published.length).toBeGreaterThan(0);
    const ids = published.map((row) => row.id);
    const legacyChoices = await db
      .select()
      .from(schema.choices)
      .where(inArray(schema.choices.questionId, ids))
      .orderBy(asc(schema.choices.sortOrder));

    const reads = await new DrizzleQuestionRepository(db).findPublishedByIds(
      ids,
    );

    expect(reads).toHaveLength(published.length);
    const byId = new Map(reads.map((read) => [read.id, read]));
    for (const row of published) {
      const read = byId.get(row.id);
      expect(read).toMatchObject({
        stemMd: row.stemMd,
        explanationMd: row.explanationMd,
        referenceMd: row.referenceMd ?? null,
        difficulty: row.difficulty,
      });
      expect(read?.choices.map((choice) => choice.id)).toEqual(
        legacyChoices
          .filter((choice) => choice.questionId === row.id)
          .map((choice) => choice.id),
      );
    }
  });
});
