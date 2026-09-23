import { randomUUID } from 'node:crypto';
import { PostgresJsPreparedQuery } from 'drizzle-orm/postgres-js/session';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import { DrizzleQuestionRepository } from '@/src/adapters/repositories/drizzle-question-repository';
import { ApplicationError } from '@/src/application/errors';
import type { QuestionProgressStatus } from '@/src/domain/value-objects';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
  createTag,
} from './helpers';

// Lookup and mapping twins for the retired call-chain units. Split from
// question-repository.integration.test.ts to respect the 800-line test-file
// policy (DEBT-469).
const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

describe('DrizzleQuestionRepository lookups', () => {
  it('maps a published question with choices sorted by sortOrder and its tags', async () => {
    const tag = await createTag(db, cleanup, {
      slug: `it-tag-${randomUUID()}`,
      kind: 'topic',
      name: 'Addiction',
    });
    const question = await createQuestion(db, cleanup, {
      slug: `it-q-${randomUUID()}`,
      status: 'published',
      difficulty: 'medium',
      tagIds: [tag.id],
    });
    // A third choice inserted last but ordered first proves the sort is by
    // sortOrder, not by insertion or label.
    await db.insert(schema.choices).values({
      questionId: question.id,
      label: 'C',
      textMd: 'Choice C',
      isCorrect: false,
      sortOrder: 0,
    });
    const repo = new DrizzleQuestionRepository(db);

    const result = await repo.findPublishedById(question.id);

    expect(result).toMatchObject({
      id: question.id,
      slug: question.slug,
      status: 'published',
      difficulty: 'medium',
      stemMd: '# Stem',
      explanationMd: '# Explanation',
      referenceMd: null,
    });
    expect(result?.choices.map((choice) => choice.label)).toEqual([
      'C',
      'A',
      'B',
    ]);
    expect(result?.choices.map((choice) => choice.isCorrect)).toEqual([
      false,
      false,
      true,
    ]);
    expect(result?.tags).toEqual([
      { id: tag.id, slug: tag.slug, name: 'Addiction', kind: 'topic' },
    ]);
  });

  it('finds a published question by slug with the same mapping', async () => {
    const question = await createQuestion(db, cleanup, {
      slug: `it-q-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const repo = new DrizzleQuestionRepository(db);

    await expect(
      repo.findPublishedBySlug(question.slug),
    ).resolves.toMatchObject({
      id: question.id,
      slug: question.slug,
      choices: [{ label: 'A' }, { label: 'B' }],
      tags: [],
    });
  });

  it('returns null from findPublishedById for a missing id', async () => {
    const repo = new DrizzleQuestionRepository(db);

    await expect(repo.findPublishedById(randomUUID())).resolves.toBeNull();
  });

  it('returns an empty list from findPublishedByIds for no ids', async () => {
    const repo = new DrizzleQuestionRepository(db);

    await expect(repo.findPublishedByIds([])).resolves.toEqual([]);
  });

  it('fails loudly when a stored choice carries an invalid label', async () => {
    const question = await createQuestion(db, cleanup, {
      slug: `it-q-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const [corrupt] = await db
      .insert(schema.choices)
      .values({
        questionId: question.id,
        label: 'Z',
        textMd: 'Corrupt',
        isCorrect: false,
        sortOrder: 3,
      })
      .returning({ id: schema.choices.id });
    if (!corrupt) throw new Error('Expected the corrupt choice row');
    const repo = new DrizzleQuestionRepository(db);

    await expect(repo.findPublishedById(question.id)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: `Invalid choice label "Z" for choice ${corrupt.id}`,
    });
  });
});

describe.each([
  'listPublishedCandidateIds',
  'countPublishedCandidateIds',
] as const)('DrizzleQuestionRepository %s input guards', (operation) => {
  // An intentionally invalid status: the exhaustive switch must reject it
  // before any statement is issued.
  const unknownStatus: string = 'unknown';

  it('throws VALIDATION_ERROR when statuses are provided without userId and issues no statement', async () => {
    const execute = vi.spyOn(PostgresJsPreparedQuery.prototype, 'execute');
    const repo = new DrizzleQuestionRepository(db);

    const promise = repo[operation]({
      tagSlugs: [],
      difficulties: [],
      statuses: ['unanswered'],
    });

    await expect(promise).rejects.toBeInstanceOf(ApplicationError);
    await expect(promise).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'userId is required when filtering by status',
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('throws INTERNAL_ERROR for an unknown status and issues no statement', async () => {
    const execute = vi.spyOn(PostgresJsPreparedQuery.prototype, 'execute');
    const repo = new DrizzleQuestionRepository(db);

    const promise = repo[operation]({
      tagSlugs: [],
      difficulties: [],
      statuses: [unknownStatus as QuestionProgressStatus],
      userId: randomUUID(),
    });

    await expect(promise).rejects.toBeInstanceOf(ApplicationError);
    await expect(promise).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Unhandled QuestionProgressStatus: unknown',
    });
    expect(execute).not.toHaveBeenCalled();
  });
});
