import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { bookmarks } from '@/db/schema';
import { DrizzleBookmarkRepository } from '@/src/adapters/repositories/drizzle-bookmark-repository';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
  createUser,
} from './helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

describe('DrizzleBookmarkRepository', () => {
  it('adds/removes bookmarks idempotently', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-q-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const repo = new DrizzleBookmarkRepository(db);

    expect(await repo.exists(user.id, question.id)).toBe(false);

    await repo.add(user.id, question.id);
    expect(await repo.exists(user.id, question.id)).toBe(true);

    await repo.add(user.id, question.id);
    expect(await repo.exists(user.id, question.id)).toBe(true);

    const list = await repo.listByUserId(user.id);
    expect(list.map((b) => b.questionId)).toContain(question.id);

    await repo.remove(user.id, question.id);
    expect(await repo.exists(user.id, question.id)).toBe(false);
  });

  it('returns relation-free page summaries and IDs-only membership in bookmark order', async () => {
    const user = await createUser(db, cleanup);
    const publishedQuestion = await createQuestion(db, cleanup, {
      slug: `it-bookmark-published-${randomUUID()}`,
      status: 'published',
      difficulty: 'medium',
    });
    const unavailableQuestion = await createQuestion(db, cleanup, {
      slug: `it-bookmark-unavailable-${randomUUID()}`,
      status: 'draft',
      difficulty: 'hard',
    });
    await db.insert(bookmarks).values([
      {
        userId: user.id,
        questionId: publishedQuestion.id,
        createdAt: new Date('2026-07-20T10:02:00.000Z'),
      },
      {
        userId: user.id,
        questionId: unavailableQuestion.id,
        createdAt: new Date('2026-07-20T10:01:00.000Z'),
      },
    ]);
    const repo = new DrizzleBookmarkRepository(db);

    await expect(repo.listQuestionIdsByUserId(user.id)).resolves.toEqual([
      publishedQuestion.id,
      unavailableQuestion.id,
    ]);
    await expect(repo.listSummariesByUserId(user.id)).resolves.toEqual([
      {
        isAvailable: true,
        questionId: publishedQuestion.id,
        slug: publishedQuestion.slug,
        stemMd: '# Stem',
        difficulty: 'medium',
        bookmarkedAt: new Date('2026-07-20T10:02:00.000Z'),
      },
      {
        isAvailable: false,
        questionId: unavailableQuestion.id,
        bookmarkedAt: new Date('2026-07-20T10:01:00.000Z'),
      },
    ]);
  });
});
