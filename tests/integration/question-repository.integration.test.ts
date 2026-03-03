import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { DrizzleQuestionRepository } from '@/src/adapters/repositories/drizzle-question-repository';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
  createTag,
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

describe('DrizzleQuestionRepository', () => {
  it('returns null for non-published questions', async () => {
    const tag = await createTag(db, cleanup, {
      slug: `it-tag-${randomUUID()}`,
      kind: 'topic',
    });
    const { id, slug } = await createQuestion(db, cleanup, {
      slug: `it-q-${randomUUID()}`,
      status: 'draft',
      difficulty: 'easy',
      tagIds: [tag.id],
    });

    const repo = new DrizzleQuestionRepository(db);

    await expect(repo.findPublishedById(id)).resolves.toBeNull();
    await expect(repo.findPublishedBySlug(slug)).resolves.toBeNull();
  });

  it('findPublishedByIds preserves input order and excludes drafts', async () => {
    const publishedA = await createQuestion(db, cleanup, {
      slug: `it-pub-a-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const draft = await createQuestion(db, cleanup, {
      slug: `it-draft-${randomUUID()}`,
      status: 'draft',
      difficulty: 'easy',
    });

    const publishedB = await createQuestion(db, cleanup, {
      slug: `it-pub-b-${randomUUID()}`,
      status: 'published',
      difficulty: 'hard',
    });

    const repo = new DrizzleQuestionRepository(db);

    const result = await repo.findPublishedByIds([
      publishedB.id,
      publishedA.id,
      draft.id,
    ]);

    expect(result.map((q) => q.id)).toEqual([publishedB.id, publishedA.id]);
  });

  it('listPublishedCandidateIds filters deterministically (difficulty + tags) and orders by createdAt desc, id asc', async () => {
    const tagSlug = `it-tag-${randomUUID()}`;
    const tag = await createTag(db, cleanup, { slug: tagSlug, kind: 'topic' });

    const createdAt = new Date('2026-01-01T00:00:00.000Z');

    const q1Id = '00000000-0000-0000-0000-000000000001';
    const q2Id = '00000000-0000-0000-0000-000000000002';

    const q1 = await createQuestion(db, cleanup, {
      id: q1Id,
      slug: `it-q1-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
      createdAt,
      tagIds: [tag.id],
    });

    const q2 = await createQuestion(db, cleanup, {
      id: q2Id,
      slug: `it-q2-${randomUUID()}`,
      status: 'published',
      difficulty: 'hard',
      createdAt,
      tagIds: [tag.id],
    });

    const repo = new DrizzleQuestionRepository(db);

    const onlyEasy = await repo.listPublishedCandidateIds({
      tagSlugs: [tagSlug],
      difficulties: ['easy'],
    });
    expect(onlyEasy).toEqual([q1.id]);

    const allForTag = await repo.listPublishedCandidateIds({
      tagSlugs: [tagSlug],
      difficulties: [],
    });

    expect(allForTag).toEqual([q1.id, q2.id]);
  });

  it('countPublishedCandidateIds returns accurate totals for difficulty + tags', async () => {
    const tagSlug = `it-count-tag-${randomUUID()}`;
    const tag = await createTag(db, cleanup, { slug: tagSlug, kind: 'topic' });

    const createdAt = new Date('2026-01-01T00:00:00.000Z');

    await createQuestion(db, cleanup, {
      slug: `it-count-q1-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
      createdAt,
      tagIds: [tag.id],
    });

    await createQuestion(db, cleanup, {
      slug: `it-count-q2-${randomUUID()}`,
      status: 'published',
      difficulty: 'hard',
      createdAt,
      tagIds: [tag.id],
    });

    const repo = new DrizzleQuestionRepository(db);

    await expect(
      repo.countPublishedCandidateIds({
        tagSlugs: [tagSlug],
        difficulties: ['easy'],
      }),
    ).resolves.toBe(1);

    await expect(
      repo.countPublishedCandidateIds({
        tagSlugs: [tagSlug],
        difficulties: [],
      }),
    ).resolves.toBe(2);
  });

  describe('listPublishedCandidateIds with status filters', () => {
    it('returns only unanswered questions when status=unanswered', async () => {
      const user = await createUser(db, cleanup);
      const tag = await createTag(db, cleanup, {
        slug: `it-status-unanswered-${randomUUID()}`,
        kind: 'topic',
      });

      const qAttempted = await createQuestion(db, cleanup, {
        slug: `it-attempted-${randomUUID()}`,
        status: 'published',
        difficulty: 'easy',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        tagIds: [tag.id],
      });
      const qUnanswered = await createQuestion(db, cleanup, {
        slug: `it-unanswered-${randomUUID()}`,
        status: 'published',
        difficulty: 'easy',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        tagIds: [tag.id],
      });

      await db.insert(schema.attempts).values({
        userId: user.id,
        questionId: qAttempted.id,
        practiceSessionId: null,
        selectedChoiceId: qAttempted.correctChoiceId,
        isCorrect: true,
        timeSpentSeconds: 0,
        answeredAt: new Date('2026-02-01T00:00:00.000Z'),
      });

      const repo = new DrizzleQuestionRepository(db);
      const result = await repo.listPublishedCandidateIds({
        tagSlugs: [tag.slug],
        difficulties: [],
        statuses: ['unanswered'],
        userId: user.id,
      });

      expect(result).toEqual([qUnanswered.id]);
    });

    it('returns only questions with latest attempt incorrect when status=incorrect', async () => {
      const user = await createUser(db, cleanup);

      const qLatestIncorrect = await createQuestion(db, cleanup, {
        slug: `it-latest-incorrect-${randomUUID()}`,
        status: 'published',
        difficulty: 'easy',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      const qLatestCorrect = await createQuestion(db, cleanup, {
        slug: `it-latest-correct-${randomUUID()}`,
        status: 'published',
        difficulty: 'easy',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      await db.insert(schema.attempts).values({
        userId: user.id,
        questionId: qLatestIncorrect.id,
        practiceSessionId: null,
        selectedChoiceId: qLatestIncorrect.incorrectChoiceId,
        isCorrect: false,
        timeSpentSeconds: 0,
        answeredAt: new Date('2026-02-01T00:00:00.000Z'),
      });

      await db.insert(schema.attempts).values([
        {
          userId: user.id,
          questionId: qLatestCorrect.id,
          practiceSessionId: null,
          selectedChoiceId: qLatestCorrect.incorrectChoiceId,
          isCorrect: false,
          timeSpentSeconds: 0,
          answeredAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          userId: user.id,
          questionId: qLatestCorrect.id,
          practiceSessionId: null,
          selectedChoiceId: qLatestCorrect.correctChoiceId,
          isCorrect: true,
          timeSpentSeconds: 0,
          answeredAt: new Date('2026-02-02T00:00:00.000Z'),
        },
      ]);

      const repo = new DrizzleQuestionRepository(db);
      const result = await repo.listPublishedCandidateIds({
        tagSlugs: [],
        difficulties: [],
        statuses: ['incorrect'],
        userId: user.id,
      });

      expect(result).toEqual([qLatestIncorrect.id]);
    });

    it('returns only bookmarked questions when status=bookmarked', async () => {
      const user = await createUser(db, cleanup);

      const qBookmarked = await createQuestion(db, cleanup, {
        slug: `it-bookmarked-${randomUUID()}`,
        status: 'published',
        difficulty: 'easy',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      const _qUnbookmarked = await createQuestion(db, cleanup, {
        slug: `it-unbookmarked-${randomUUID()}`,
        status: 'published',
        difficulty: 'easy',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      await db.insert(schema.bookmarks).values({
        userId: user.id,
        questionId: qBookmarked.id,
      });

      const repo = new DrizzleQuestionRepository(db);
      const result = await repo.listPublishedCandidateIds({
        tagSlugs: [],
        difficulties: [],
        statuses: ['bookmarked'],
        userId: user.id,
      });

      expect(result).toEqual([qBookmarked.id]);
    });

    it('combines unanswered and incorrect with OR logic', async () => {
      const user = await createUser(db, cleanup);
      const tag = await createTag(db, cleanup, {
        slug: `it-status-or-${randomUUID()}`,
        kind: 'topic',
      });

      const qIncorrect = await createQuestion(db, cleanup, {
        slug: `it-or-incorrect-${randomUUID()}`,
        status: 'published',
        difficulty: 'easy',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        tagIds: [tag.id],
      });
      const qUnanswered = await createQuestion(db, cleanup, {
        slug: `it-or-unanswered-${randomUUID()}`,
        status: 'published',
        difficulty: 'easy',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        tagIds: [tag.id],
      });
      const qCorrect = await createQuestion(db, cleanup, {
        slug: `it-or-correct-${randomUUID()}`,
        status: 'published',
        difficulty: 'easy',
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
        tagIds: [tag.id],
      });

      await db.insert(schema.attempts).values([
        {
          userId: user.id,
          questionId: qIncorrect.id,
          practiceSessionId: null,
          selectedChoiceId: qIncorrect.incorrectChoiceId,
          isCorrect: false,
          timeSpentSeconds: 0,
          answeredAt: new Date('2026-02-01T00:00:00.000Z'),
        },
        {
          userId: user.id,
          questionId: qCorrect.id,
          practiceSessionId: null,
          selectedChoiceId: qCorrect.correctChoiceId,
          isCorrect: true,
          timeSpentSeconds: 0,
          answeredAt: new Date('2026-02-02T00:00:00.000Z'),
        },
      ]);

      const repo = new DrizzleQuestionRepository(db);
      const result = await repo.listPublishedCandidateIds({
        tagSlugs: [tag.slug],
        difficulties: [],
        statuses: ['unanswered', 'incorrect'],
        userId: user.id,
      });

      expect(new Set(result)).toEqual(new Set([qUnanswered.id, qIncorrect.id]));
      expect(result).not.toContain(qCorrect.id);
    });

    it('returns all questions when statuses is empty', async () => {
      const user = await createUser(db, cleanup);
      const tag = await createTag(db, cleanup, {
        slug: `it-status-empty-${randomUUID()}`,
        kind: 'topic',
      });

      const q1 = await createQuestion(db, cleanup, {
        slug: `it-all-1-${randomUUID()}`,
        status: 'published',
        difficulty: 'easy',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        tagIds: [tag.id],
      });
      const q2 = await createQuestion(db, cleanup, {
        slug: `it-all-2-${randomUUID()}`,
        status: 'published',
        difficulty: 'hard',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        tagIds: [tag.id],
      });

      const repo = new DrizzleQuestionRepository(db);
      const result = await repo.listPublishedCandidateIds({
        tagSlugs: [tag.slug],
        difficulties: [],
        statuses: [],
        userId: user.id,
      });

      expect(result).toEqual([q2.id, q1.id]);
    });

    it('combines status filter with difficulty filter (AND logic)', async () => {
      const user = await createUser(db, cleanup);

      const qBookmarkedEasy = await createQuestion(db, cleanup, {
        slug: `it-bookmarked-easy-${randomUUID()}`,
        status: 'published',
        difficulty: 'easy',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      const qBookmarkedHard = await createQuestion(db, cleanup, {
        slug: `it-bookmarked-hard-${randomUUID()}`,
        status: 'published',
        difficulty: 'hard',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      await db.insert(schema.bookmarks).values([
        { userId: user.id, questionId: qBookmarkedEasy.id },
        { userId: user.id, questionId: qBookmarkedHard.id },
      ]);

      const repo = new DrizzleQuestionRepository(db);
      const result = await repo.listPublishedCandidateIds({
        tagSlugs: [],
        difficulties: ['easy'],
        statuses: ['bookmarked'],
        userId: user.id,
      });

      expect(result).toEqual([qBookmarkedEasy.id]);
    });

    it('combines status filter with tag filter (AND logic)', async () => {
      const user = await createUser(db, cleanup);
      const tag = await createTag(db, cleanup, {
        slug: `it-tag-${randomUUID()}`,
        kind: 'topic',
      });

      const qTagged = await createQuestion(db, cleanup, {
        slug: `it-tagged-${randomUUID()}`,
        status: 'published',
        difficulty: 'easy',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        tagIds: [tag.id],
      });
      const qUntagged = await createQuestion(db, cleanup, {
        slug: `it-untagged-${randomUUID()}`,
        status: 'published',
        difficulty: 'easy',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      await db.insert(schema.bookmarks).values([
        { userId: user.id, questionId: qTagged.id },
        { userId: user.id, questionId: qUntagged.id },
      ]);

      const repo = new DrizzleQuestionRepository(db);
      const result = await repo.listPublishedCandidateIds({
        tagSlugs: [tag.slug],
        difficulties: [],
        statuses: ['bookmarked'],
        userId: user.id,
      });

      expect(result).toEqual([qTagged.id]);
    });
  });

  describe('countPublishedCandidateIds with status filters', () => {
    it('returns only bookmarked questions when status=bookmarked', async () => {
      const user = await createUser(db, cleanup);
      const tag = await createTag(db, cleanup, {
        slug: `it-count-bookmarked-tag-${randomUUID()}`,
        kind: 'topic',
      });

      const qBookmarked = await createQuestion(db, cleanup, {
        slug: `it-count-bookmarked-${randomUUID()}`,
        status: 'published',
        difficulty: 'easy',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        tagIds: [tag.id],
      });
      const _qUnbookmarked = await createQuestion(db, cleanup, {
        slug: `it-count-unbookmarked-${randomUUID()}`,
        status: 'published',
        difficulty: 'easy',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        tagIds: [tag.id],
      });

      await db.insert(schema.bookmarks).values({
        userId: user.id,
        questionId: qBookmarked.id,
      });

      const repo = new DrizzleQuestionRepository(db);
      const result = await repo.countPublishedCandidateIds({
        tagSlugs: [tag.slug],
        difficulties: [],
        statuses: ['bookmarked'],
        userId: user.id,
      });

      expect(result).toBe(1);
    });

    it('combines unanswered and incorrect with OR logic', async () => {
      const user = await createUser(db, cleanup);
      const tag = await createTag(db, cleanup, {
        slug: `it-count-or-tag-${randomUUID()}`,
        kind: 'topic',
      });

      const qIncorrect = await createQuestion(db, cleanup, {
        slug: `it-count-or-incorrect-${randomUUID()}`,
        status: 'published',
        difficulty: 'easy',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        tagIds: [tag.id],
      });
      const _qUnanswered = await createQuestion(db, cleanup, {
        slug: `it-count-or-unanswered-${randomUUID()}`,
        status: 'published',
        difficulty: 'easy',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        tagIds: [tag.id],
      });
      const qCorrect = await createQuestion(db, cleanup, {
        slug: `it-count-or-correct-${randomUUID()}`,
        status: 'published',
        difficulty: 'easy',
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
        tagIds: [tag.id],
      });

      await db.insert(schema.attempts).values([
        {
          userId: user.id,
          questionId: qIncorrect.id,
          practiceSessionId: null,
          selectedChoiceId: qIncorrect.incorrectChoiceId,
          isCorrect: false,
          timeSpentSeconds: 0,
          answeredAt: new Date('2026-02-01T00:00:00.000Z'),
        },
        {
          userId: user.id,
          questionId: qCorrect.id,
          practiceSessionId: null,
          selectedChoiceId: qCorrect.correctChoiceId,
          isCorrect: true,
          timeSpentSeconds: 0,
          answeredAt: new Date('2026-02-02T00:00:00.000Z'),
        },
      ]);

      const repo = new DrizzleQuestionRepository(db);
      const result = await repo.countPublishedCandidateIds({
        tagSlugs: [tag.slug],
        difficulties: [],
        statuses: ['unanswered', 'incorrect'],
        userId: user.id,
      });

      expect(result).toBe(2);
    });
  });
});
