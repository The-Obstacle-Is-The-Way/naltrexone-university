import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { DrizzleQuestionRepository } from '@/src/adapters/repositories/drizzle-question-repository';
import {
  addCurrentRevision,
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

describe('ADR-021 phase 2a: question content reads through the current revision', () => {
  it("reads the stem, explanation, reference and difficulty from the question's current revision", async () => {
    const question = await createPublishedQuestion('content');

    const read = await new DrizzleQuestionRepository(db).findPublishedById(
      question.id,
    );

    expect(read).toMatchObject({
      revisionId: await currentRevisionId(question.id),
      stemMd: '# Stem',
      explanationMd: '# Explanation',
      referenceMd: null,
      difficulty: 'easy',
    });
  });

  it("reads only the current revision's choices", async () => {
    const question = await createPublishedQuestion('choices');
    await addCurrentRevision(db, question.id);
    const repository = new DrizzleQuestionRepository(db);
    // A session item an older deployment left unbound reads the current
    // revision too; a bound item is covered by the session-reads suite.
    const unboundItem = { questionId: question.id, questionRevisionId: null };

    for (const read of [
      await repository.findPublishedById(question.id),
      await repository.findPublishedBySlug(question.slug),
      (await repository.findPublishedByIds([question.id]))[0],
      await repository.findByIdForSession(unboundItem),
      (await repository.findByIdsForSession([unboundItem]))[0],
    ]) {
      expect(read?.stemMd).toBe('# Revised stem');
      expect(read?.choices.map((choice) => choice.label)).toEqual(['C', 'D']);
    }
  });

  it("filters selection by the current revision's difficulty", async () => {
    // Created easy; the current revision is hard.
    const question = await createPublishedQuestion('difficulty');
    await addCurrentRevision(db, question.id);
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
});
