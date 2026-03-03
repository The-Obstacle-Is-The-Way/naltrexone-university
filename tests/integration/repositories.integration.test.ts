import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import type { PracticeSessionParams } from '@/db/schema';
import * as schema from '@/db/schema';
import { DrizzleAttemptRepository } from '@/src/adapters/repositories/drizzle-attempt-repository';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import { DrizzleQuestionRepository } from '@/src/adapters/repositories/drizzle-question-repository';
import { FakeLogger } from '@/src/application/test-helpers/fakes/fake-logger';
import { GetPracticeSessionReviewUseCase } from '@/src/application/use-cases/get-practice-session-review';
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

      const [qLatestIncorrectChoiceA] = await db
        .select({ id: schema.choices.id })
        .from(schema.choices)
        .where(
          and(
            eq(schema.choices.questionId, qLatestIncorrect.id),
            eq(schema.choices.label, 'A'),
          ),
        )
        .limit(1);
      if (!qLatestIncorrectChoiceA) {
        throw new Error('Failed to load incorrect choice for setup');
      }

      await db.insert(schema.attempts).values({
        userId: user.id,
        questionId: qLatestIncorrect.id,
        practiceSessionId: null,
        selectedChoiceId: qLatestIncorrectChoiceA.id,
        isCorrect: false,
        timeSpentSeconds: 0,
        answeredAt: new Date('2026-02-01T00:00:00.000Z'),
      });

      const [qLatestCorrectChoiceA] = await db
        .select({ id: schema.choices.id })
        .from(schema.choices)
        .where(
          and(
            eq(schema.choices.questionId, qLatestCorrect.id),
            eq(schema.choices.label, 'A'),
          ),
        )
        .limit(1);
      if (!qLatestCorrectChoiceA) {
        throw new Error('Failed to load choice for latest-correct setup');
      }

      await db.insert(schema.attempts).values([
        {
          userId: user.id,
          questionId: qLatestCorrect.id,
          practiceSessionId: null,
          selectedChoiceId: qLatestCorrectChoiceA.id,
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

      const [qIncorrectChoiceA] = await db
        .select({ id: schema.choices.id })
        .from(schema.choices)
        .where(
          and(
            eq(schema.choices.questionId, qIncorrect.id),
            eq(schema.choices.label, 'A'),
          ),
        )
        .limit(1);
      if (!qIncorrectChoiceA) {
        throw new Error('Failed to load incorrect choice for setup');
      }

      await db.insert(schema.attempts).values([
        {
          userId: user.id,
          questionId: qIncorrect.id,
          practiceSessionId: null,
          selectedChoiceId: qIncorrectChoiceA.id,
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

      const [qIncorrectChoiceA] = await db
        .select({ id: schema.choices.id })
        .from(schema.choices)
        .where(
          and(
            eq(schema.choices.questionId, qIncorrect.id),
            eq(schema.choices.label, 'A'),
          ),
        )
        .limit(1);
      if (!qIncorrectChoiceA) {
        throw new Error('Failed to load incorrect choice for setup');
      }

      await db.insert(schema.attempts).values([
        {
          userId: user.id,
          questionId: qIncorrect.id,
          practiceSessionId: null,
          selectedChoiceId: qIncorrectChoiceA.id,
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

describe('DrizzlePracticeSessionRepository + DrizzleAttemptRepository', () => {
  it('inserts attempts and enforces user scoping on findBySessionId', async () => {
    const userA = await createUser(db, cleanup);
    const userB = await createUser(db, cleanup);

    const question = await createQuestion(db, cleanup, {
      slug: `it-q-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const attemptRepo = new DrizzleAttemptRepository(db);

    const session = await sessionRepo.create({
      userId: userA.id,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });

    await attemptRepo.insert({
      userId: userA.id,
      questionId: question.id,
      practiceSessionId: session.id,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 10,
    });

    const attemptsForA = await attemptRepo.findBySessionId(
      session.id,
      userA.id,
    );
    expect(attemptsForA).toHaveLength(1);

    const attemptsForB = await attemptRepo.findBySessionId(
      session.id,
      userB.id,
    );
    expect(attemptsForB).toHaveLength(0);
  });

  it('returns null from findLatestByUserAndQuestion when no attempts exist', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-q-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const attemptRepo = new DrizzleAttemptRepository(db);
    await expect(
      attemptRepo.findLatestByUserAndQuestion(user.id, question.id),
    ).resolves.toBeNull();
  });

  it('returns the most recent attempt from findLatestByUserAndQuestion', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-q-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const choices = await db
      .select({ id: schema.choices.id })
      .from(schema.choices)
      .where(eq(schema.choices.questionId, question.id));

    const incorrectChoiceId = choices.find(
      (c) => c.id !== question.correctChoiceId,
    )?.id;
    if (!incorrectChoiceId) throw new Error('Missing incorrect choice');

    const attemptRepo = new DrizzleAttemptRepository(db);

    const first = await attemptRepo.insert({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: null,
      selectedChoiceId: incorrectChoiceId,
      isCorrect: false,
      timeSpentSeconds: 1,
    });

    const second = await attemptRepo.insert({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: null,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    const t1 = new Date('2026-02-06T00:00:00.000Z');
    const t2 = new Date('2026-02-07T00:00:00.000Z');

    await db
      .update(schema.attempts)
      .set({ answeredAt: t1 })
      .where(eq(schema.attempts.id, first.id));
    await db
      .update(schema.attempts)
      .set({ answeredAt: t2 })
      .where(eq(schema.attempts.id, second.id));

    await expect(
      attemptRepo.findLatestByUserAndQuestion(user.id, question.id),
    ).resolves.toMatchObject({
      id: second.id,
      userId: user.id,
      questionId: question.id,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
    });
  });

  it('uses id desc as a deterministic tie-breaker for findLatestByUserAndQuestion', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-q-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const tieAnsweredAt = new Date('2026-02-06T00:00:00.000Z');
    const lowerId = '00000000-0000-4000-8000-000000000001';
    const higherId = 'ffffffff-ffff-4fff-bfff-ffffffffffff';

    await db.insert(schema.attempts).values([
      {
        id: lowerId,
        userId: user.id,
        questionId: question.id,
        practiceSessionId: null,
        selectedChoiceId: question.correctChoiceId,
        isCorrect: false,
        timeSpentSeconds: 1,
        answeredAt: tieAnsweredAt,
      },
      {
        id: higherId,
        userId: user.id,
        questionId: question.id,
        practiceSessionId: null,
        selectedChoiceId: question.correctChoiceId,
        isCorrect: true,
        timeSpentSeconds: 1,
        answeredAt: tieAnsweredAt,
      },
    ]);

    const attemptRepo = new DrizzleAttemptRepository(db);
    await expect(
      attemptRepo.findLatestByUserAndQuestion(user.id, question.id),
    ).resolves.toMatchObject({
      id: higherId,
      isCorrect: true,
    });
  });

  it('returns attempt from findByIdAndUserId when id and userId match', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-q-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const attemptRepo = new DrizzleAttemptRepository(db);
    const attempt = await attemptRepo.insert({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: null,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    await expect(
      attemptRepo.findByIdAndUserId(attempt.id, user.id),
    ).resolves.toMatchObject({
      id: attempt.id,
      userId: user.id,
      questionId: question.id,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
    });
  });

  it('returns null from findByIdAndUserId when id exists but userId does not match', async () => {
    const userA = await createUser(db, cleanup);
    const userB = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-q-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const attemptRepo = new DrizzleAttemptRepository(db);
    const attempt = await attemptRepo.insert({
      userId: userA.id,
      questionId: question.id,
      practiceSessionId: null,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    await expect(
      attemptRepo.findByIdAndUserId(attempt.id, userB.id),
    ).resolves.toBeNull();
  });

  it('returns null from findByIdAndUserId when id does not exist', async () => {
    const user = await createUser(db, cleanup);

    const attemptRepo = new DrizzleAttemptRepository(db);
    await expect(
      attemptRepo.findByIdAndUserId(randomUUID(), user.id),
    ).resolves.toBeNull();
  });

  it('returns attempt from findBySessionIdAndQuestionId when sessionId, questionId, and userId match', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-q-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const session = await sessionRepo.create({
      userId: user.id,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });

    const attemptRepo = new DrizzleAttemptRepository(db);
    const attempt = await attemptRepo.insert({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: session.id,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    await expect(
      attemptRepo.findBySessionIdAndQuestionId(
        session.id,
        user.id,
        question.id,
      ),
    ).resolves.toMatchObject({
      id: attempt.id,
      userId: user.id,
      questionId: question.id,
    });
  });

  it('returns null from findBySessionIdAndQuestionId when sessionId exists but questionId does not match', async () => {
    const user = await createUser(db, cleanup);
    const q1 = await createQuestion(db, cleanup, {
      slug: `it-q1-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const q2 = await createQuestion(db, cleanup, {
      slug: `it-q2-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const session = await sessionRepo.create({
      userId: user.id,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [q1.id],
      },
    });

    const attemptRepo = new DrizzleAttemptRepository(db);
    await attemptRepo.insert({
      userId: user.id,
      questionId: q1.id,
      practiceSessionId: session.id,
      selectedChoiceId: q1.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    await expect(
      attemptRepo.findBySessionIdAndQuestionId(session.id, user.id, q2.id),
    ).resolves.toBeNull();
  });

  it('returns null from findBySessionIdAndQuestionId when sessionId exists but userId does not match', async () => {
    const userA = await createUser(db, cleanup);
    const userB = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-q-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const session = await sessionRepo.create({
      userId: userA.id,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });

    const attemptRepo = new DrizzleAttemptRepository(db);
    await attemptRepo.insert({
      userId: userA.id,
      questionId: question.id,
      practiceSessionId: session.id,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    await expect(
      attemptRepo.findBySessionIdAndQuestionId(
        session.id,
        userB.id,
        question.id,
      ),
    ).resolves.toBeNull();
  });

  it('returns null from findBySessionIdAndQuestionId when sessionId does not exist', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-q-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const attemptRepo = new DrizzleAttemptRepository(db);
    await expect(
      attemptRepo.findBySessionIdAndQuestionId(
        randomUUID(),
        user.id,
        question.id,
      ),
    ).resolves.toBeNull();
  });

  it('rejects deleting a choice referenced by an attempt', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-q-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const attemptRepo = new DrizzleAttemptRepository(db);
    await attemptRepo.insert({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: null,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    await expect(
      db
        .delete(schema.choices)
        .where(eq(schema.choices.id, question.correctChoiceId)),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
  });

  it('ends practice sessions once', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-q-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const sessionRepo = new DrizzlePracticeSessionRepository(db);

    const created = await sessionRepo.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });

    const ended = await sessionRepo.end(created.id, user.id);
    expect(ended.endedAt).not.toBeNull();

    await expect(sessionRepo.end(created.id, user.id)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('returns per-question most recent answeredAt', async () => {
    const user = await createUser(db, cleanup);

    const q1 = await createQuestion(db, cleanup, {
      slug: `it-q1-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const q2 = await createQuestion(db, cleanup, {
      slug: `it-q2-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const attemptRepo = new DrizzleAttemptRepository(db);

    const a1 = await attemptRepo.insert({
      userId: user.id,
      questionId: q1.id,
      practiceSessionId: null,
      selectedChoiceId: q1.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    const a2 = await attemptRepo.insert({
      userId: user.id,
      questionId: q1.id,
      practiceSessionId: null,
      selectedChoiceId: q1.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    const b1 = await attemptRepo.insert({
      userId: user.id,
      questionId: q2.id,
      practiceSessionId: null,
      selectedChoiceId: q2.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    const t1 = new Date('2026-01-01T00:00:00.000Z');
    const t2 = new Date('2026-01-02T00:00:00.000Z');
    const t3 = new Date('2026-01-03T00:00:00.000Z');

    await db
      .update(schema.attempts)
      .set({ answeredAt: t1 })
      .where(eq(schema.attempts.id, a1.id));
    await db
      .update(schema.attempts)
      .set({ answeredAt: t2 })
      .where(eq(schema.attempts.id, a2.id));
    await db
      .update(schema.attempts)
      .set({ answeredAt: t3 })
      .where(eq(schema.attempts.id, b1.id));

    const mostRecent = await attemptRepo.findMostRecentAnsweredAtByQuestionIds(
      user.id,
      [q1.id, q2.id],
    );

    const byQuestionId = new Map(
      mostRecent.map((r) => [r.questionId, r.answeredAt]),
    );
    expect(byQuestionId.get(q1.id)?.toISOString()).toBe(t2.toISOString());
    expect(byQuestionId.get(q2.id)?.toISOString()).toBe(t3.toISOString());
  });

  it('lists attempted questions by latest attempt per question', async () => {
    const user = await createUser(db, cleanup);

    const q1 = await createQuestion(db, cleanup, {
      slug: `it-attempted-q1-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const q2 = await createQuestion(db, cleanup, {
      slug: `it-attempted-q2-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const attemptRepo = new DrizzleAttemptRepository(db);

    const q1Correct = await attemptRepo.insert({
      userId: user.id,
      questionId: q1.id,
      practiceSessionId: null,
      selectedChoiceId: q1.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    const q1Incorrect = await attemptRepo.insert({
      userId: user.id,
      questionId: q1.id,
      practiceSessionId: null,
      selectedChoiceId: q1.correctChoiceId,
      isCorrect: false,
      timeSpentSeconds: 1,
    });

    const q2Incorrect = await attemptRepo.insert({
      userId: user.id,
      questionId: q2.id,
      practiceSessionId: null,
      selectedChoiceId: q2.correctChoiceId,
      isCorrect: false,
      timeSpentSeconds: 1,
    });

    const q2Correct = await attemptRepo.insert({
      userId: user.id,
      questionId: q2.id,
      practiceSessionId: null,
      selectedChoiceId: q2.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    const t1 = new Date('2026-01-01T00:00:00.000Z');
    const t2 = new Date('2026-01-02T00:00:00.000Z');
    const t3 = new Date('2026-01-03T00:00:00.000Z');
    const t4 = new Date('2026-01-04T00:00:00.000Z');

    await db
      .update(schema.attempts)
      .set({ answeredAt: t1 })
      .where(eq(schema.attempts.id, q1Correct.id));

    await db
      .update(schema.attempts)
      .set({ answeredAt: t2 })
      .where(eq(schema.attempts.id, q1Incorrect.id));

    await db
      .update(schema.attempts)
      .set({ answeredAt: t3 })
      .where(eq(schema.attempts.id, q2Incorrect.id));

    await db
      .update(schema.attempts)
      .set({ answeredAt: t4 })
      .where(eq(schema.attempts.id, q2Correct.id));

    const attempted = await attemptRepo.listAttemptedQuestionsByUserId(
      user.id,
      10,
      0,
    );

    expect(attempted.map((m) => m.questionId)).toEqual([q2.id, q1.id]);
    expect(attempted[0]).toMatchObject({
      questionId: q2.id,
      isCorrect: true,
      sessionId: null,
      sessionMode: null,
    });
    expect(attempted[0]?.answeredAt.toISOString()).toBe(t4.toISOString());
    expect(attempted[1]).toMatchObject({
      questionId: q1.id,
      isCorrect: false,
      sessionId: null,
      sessionMode: null,
    });
    expect(attempted[1]?.answeredAt.toISOString()).toBe(t2.toISOString());

    const incorrectOnly = await attemptRepo.listAttemptedQuestionsByUserId(
      user.id,
      10,
      0,
      { result: 'incorrect' },
    );
    expect(incorrectOnly.map((m) => m.questionId)).toEqual([q1.id]);
  });

  it('supports attempted-question difficulty filter and accurate counts', async () => {
    const user = await createUser(db, cleanup);

    const qEasy = await createQuestion(db, cleanup, {
      slug: `it-attempted-difficulty-easy-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const qHardA = await createQuestion(db, cleanup, {
      slug: `it-attempted-difficulty-hard-a-${randomUUID()}`,
      status: 'published',
      difficulty: 'hard',
    });
    const qHardB = await createQuestion(db, cleanup, {
      slug: `it-attempted-difficulty-hard-b-${randomUUID()}`,
      status: 'published',
      difficulty: 'hard',
    });

    const attemptRepo = new DrizzleAttemptRepository(db);

    const aEasy = await attemptRepo.insert({
      userId: user.id,
      questionId: qEasy.id,
      practiceSessionId: null,
      selectedChoiceId: qEasy.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    const aHardA = await attemptRepo.insert({
      userId: user.id,
      questionId: qHardA.id,
      practiceSessionId: null,
      selectedChoiceId: qHardA.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    const aHardB = await attemptRepo.insert({
      userId: user.id,
      questionId: qHardB.id,
      practiceSessionId: null,
      selectedChoiceId: qHardB.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    const t1 = new Date('2026-02-01T00:00:00.000Z');
    const t2 = new Date('2026-02-02T00:00:00.000Z');
    const t3 = new Date('2026-02-03T00:00:00.000Z');

    await db
      .update(schema.attempts)
      .set({ answeredAt: t1 })
      .where(eq(schema.attempts.id, aEasy.id));
    await db
      .update(schema.attempts)
      .set({ answeredAt: t2 })
      .where(eq(schema.attempts.id, aHardA.id));
    await db
      .update(schema.attempts)
      .set({ answeredAt: t3 })
      .where(eq(schema.attempts.id, aHardB.id));

    const hardOnly = await attemptRepo.listAttemptedQuestionsByUserId(
      user.id,
      10,
      0,
      { difficulty: 'hard' },
    );
    expect(hardOnly.map((m) => m.questionId)).toEqual([qHardB.id, qHardA.id]);

    await expect(
      attemptRepo.countAttemptedQuestionsByUserId(user.id, {
        difficulty: 'hard',
      }),
    ).resolves.toBe(2);
  });

  it('supports attempted-question tagSlug filter and accurate counts', async () => {
    const user = await createUser(db, cleanup);

    const tagPharm = await createTag(db, cleanup, {
      slug: `it-tag-pharmacology-${randomUUID()}`,
      kind: 'topic',
      name: 'Pharmacology',
    });

    const tagOther = await createTag(db, cleanup, {
      slug: `it-tag-other-${randomUUID()}`,
      kind: 'topic',
      name: 'Other',
    });

    const qPharmA = await createQuestion(db, cleanup, {
      slug: `it-attempted-tag-pharm-a-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
      tagIds: [tagPharm.id],
    });
    const qPharmB = await createQuestion(db, cleanup, {
      slug: `it-attempted-tag-pharm-b-${randomUUID()}`,
      status: 'published',
      difficulty: 'hard',
      tagIds: [tagPharm.id],
    });
    const qOther = await createQuestion(db, cleanup, {
      slug: `it-attempted-tag-other-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
      tagIds: [tagOther.id],
    });

    const attemptRepo = new DrizzleAttemptRepository(db);

    const aOther = await attemptRepo.insert({
      userId: user.id,
      questionId: qOther.id,
      practiceSessionId: null,
      selectedChoiceId: qOther.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });
    const aPharmA = await attemptRepo.insert({
      userId: user.id,
      questionId: qPharmA.id,
      practiceSessionId: null,
      selectedChoiceId: qPharmA.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });
    const aPharmB = await attemptRepo.insert({
      userId: user.id,
      questionId: qPharmB.id,
      practiceSessionId: null,
      selectedChoiceId: qPharmB.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    const t1 = new Date('2026-02-01T00:00:00.000Z');
    const t2 = new Date('2026-02-02T00:00:00.000Z');
    const t3 = new Date('2026-02-03T00:00:00.000Z');

    await db
      .update(schema.attempts)
      .set({ answeredAt: t1 })
      .where(eq(schema.attempts.id, aOther.id));
    await db
      .update(schema.attempts)
      .set({ answeredAt: t2 })
      .where(eq(schema.attempts.id, aPharmA.id));
    await db
      .update(schema.attempts)
      .set({ answeredAt: t3 })
      .where(eq(schema.attempts.id, aPharmB.id));

    const pharmOnly = await attemptRepo.listAttemptedQuestionsByUserId(
      user.id,
      10,
      0,
      { tagSlug: tagPharm.slug },
    );
    expect(pharmOnly.map((m) => m.questionId)).toEqual([
      qPharmB.id,
      qPharmA.id,
    ]);

    await expect(
      attemptRepo.countAttemptedQuestionsByUserId(user.id, {
        tagSlug: tagPharm.slug,
      }),
    ).resolves.toBe(2);
  });

  it('supports combined attempted-question result + difficulty filters', async () => {
    const user = await createUser(db, cleanup);

    const qHardIncorrect = await createQuestion(db, cleanup, {
      slug: `it-attempted-result-difficulty-hard-incorrect-${randomUUID()}`,
      status: 'published',
      difficulty: 'hard',
    });
    const qHardCorrect = await createQuestion(db, cleanup, {
      slug: `it-attempted-result-difficulty-hard-correct-${randomUUID()}`,
      status: 'published',
      difficulty: 'hard',
    });
    const qEasyIncorrect = await createQuestion(db, cleanup, {
      slug: `it-attempted-result-difficulty-easy-incorrect-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const attemptRepo = new DrizzleAttemptRepository(db);

    const aHardIncorrect = await attemptRepo.insert({
      userId: user.id,
      questionId: qHardIncorrect.id,
      practiceSessionId: null,
      selectedChoiceId: qHardIncorrect.correctChoiceId,
      isCorrect: false,
      timeSpentSeconds: 1,
    });

    const aHardCorrect = await attemptRepo.insert({
      userId: user.id,
      questionId: qHardCorrect.id,
      practiceSessionId: null,
      selectedChoiceId: qHardCorrect.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    const aEasyIncorrect = await attemptRepo.insert({
      userId: user.id,
      questionId: qEasyIncorrect.id,
      practiceSessionId: null,
      selectedChoiceId: qEasyIncorrect.correctChoiceId,
      isCorrect: false,
      timeSpentSeconds: 1,
    });

    const t1 = new Date('2026-02-01T00:00:00.000Z');
    const t2 = new Date('2026-02-02T00:00:00.000Z');
    const t3 = new Date('2026-02-03T00:00:00.000Z');

    await db
      .update(schema.attempts)
      .set({ answeredAt: t1 })
      .where(eq(schema.attempts.id, aEasyIncorrect.id));
    await db
      .update(schema.attempts)
      .set({ answeredAt: t2 })
      .where(eq(schema.attempts.id, aHardCorrect.id));
    await db
      .update(schema.attempts)
      .set({ answeredAt: t3 })
      .where(eq(schema.attempts.id, aHardIncorrect.id));

    const result = await attemptRepo.listAttemptedQuestionsByUserId(
      user.id,
      10,
      0,
      { result: 'incorrect', difficulty: 'hard' },
    );

    expect(result.map((m) => m.questionId)).toEqual([qHardIncorrect.id]);

    await expect(
      attemptRepo.countAttemptedQuestionsByUserId(user.id, {
        result: 'incorrect',
        difficulty: 'hard',
      }),
    ).resolves.toBe(1);
  });

  it('uses id desc as deterministic tie-breaker for latest attempted-question semantics', async () => {
    const user = await createUser(db, cleanup);

    const qTie = await createQuestion(db, cleanup, {
      slug: `it-attempted-tie-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const qIncorrect = await createQuestion(db, cleanup, {
      slug: `it-attempted-incorrect-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const tieAnsweredAt = new Date('2026-02-06T00:00:00.000Z');
    const tieIncorrectId = '00000000-0000-4000-8000-000000000001';
    const tieCorrectId = 'ffffffff-ffff-4fff-bfff-ffffffffffff';

    await db.insert(schema.attempts).values([
      {
        id: tieIncorrectId,
        userId: user.id,
        questionId: qTie.id,
        practiceSessionId: null,
        selectedChoiceId: qTie.correctChoiceId,
        isCorrect: false,
        timeSpentSeconds: 1,
        answeredAt: tieAnsweredAt,
      },
      {
        id: tieCorrectId,
        userId: user.id,
        questionId: qTie.id,
        practiceSessionId: null,
        selectedChoiceId: qTie.correctChoiceId,
        isCorrect: true,
        timeSpentSeconds: 1,
        answeredAt: tieAnsweredAt,
      },
      {
        id: '00000000-0000-4000-8000-000000000002',
        userId: user.id,
        questionId: qIncorrect.id,
        practiceSessionId: null,
        selectedChoiceId: qIncorrect.correctChoiceId,
        isCorrect: false,
        timeSpentSeconds: 1,
        answeredAt: new Date('2026-02-05T00:00:00.000Z'),
      },
    ]);

    const attemptRepo = new DrizzleAttemptRepository(db);
    const attemptedIncorrect = await attemptRepo.listAttemptedQuestionsByUserId(
      user.id,
      10,
      0,
      { result: 'incorrect' },
    );

    expect(attemptedIncorrect).toEqual([
      {
        questionId: qIncorrect.id,
        answeredAt: new Date('2026-02-05T00:00:00.000Z'),
        isCorrect: false,
        sessionId: null,
        sessionMode: null,
      },
    ]);
    await expect(
      attemptRepo.countAttemptedQuestionsByUserId(user.id, {
        result: 'incorrect',
      }),
    ).resolves.toBe(1);
  });
});

describe('BUG-186: GetPracticeSessionReview active-exam secrecy', () => {
  it('redacts isCorrect for active exam and reveals it after session ends', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-review-secrecy-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const questionRepo = new DrizzleQuestionRepository(db);
    const logger = new FakeLogger();

    const session = await sessionRepo.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });

    await sessionRepo.recordQuestionAnswer({
      sessionId: session.id,
      userId: user.id,
      questionId: question.id,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
      answeredAt: new Date(),
    });

    const useCase = new GetPracticeSessionReviewUseCase(
      sessionRepo,
      questionRepo,
      logger,
    );

    // While exam is active: isCorrect must be null
    const activeResult = await useCase.execute({
      userId: user.id,
      sessionId: session.id,
    });
    expect(activeResult.rows).toHaveLength(1);
    expect(activeResult.rows[0]?.isCorrect).toBeNull();
    expect(activeResult.mode).toBe('exam');

    // End the session
    await sessionRepo.end(session.id, user.id);

    // After exam ends: isCorrect must be visible
    const endedResult = await useCase.execute({
      userId: user.id,
      sessionId: session.id,
    });
    expect(endedResult.rows).toHaveLength(1);
    expect(endedResult.rows[0]?.isCorrect).toBe(true);
  });

  it('does not redact isCorrect for tutor-mode sessions', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-tutor-no-redact-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const questionRepo = new DrizzleQuestionRepository(db);
    const logger = new FakeLogger();

    const session = await sessionRepo.create({
      userId: user.id,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });

    await sessionRepo.recordQuestionAnswer({
      sessionId: session.id,
      userId: user.id,
      questionId: question.id,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: false,
      answeredAt: new Date(),
    });

    const useCase = new GetPracticeSessionReviewUseCase(
      sessionRepo,
      questionRepo,
      logger,
    );

    // Tutor mode always shows correctness, even while active
    const result = await useCase.execute({
      userId: user.id,
      sessionId: session.id,
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.isCorrect).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// BUG-187: Dashboard count queries exclude active-exam attempts
// ---------------------------------------------------------------------------
describe('BUG-187: Dashboard counts exclude active-exam attempts', () => {
  it('excludes active-exam attempts from countByUserId and countCorrectByUserId', async () => {
    const user = await createUser(db, cleanup);
    const q1 = await createQuestion(db, cleanup, {
      slug: `it-count-exam-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const q2 = await createQuestion(db, cleanup, {
      slug: `it-count-adhoc-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const attemptRepo = new DrizzleAttemptRepository(db);

    // Create an active exam session
    const examSession = await sessionRepo.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [q1.id],
      },
    });

    // Attempt attached to active exam
    await attemptRepo.insert({
      userId: user.id,
      questionId: q1.id,
      practiceSessionId: examSession.id,
      selectedChoiceId: q1.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 5,
    });

    // Adhoc attempt (no session)
    await attemptRepo.insert({
      userId: user.id,
      questionId: q2.id,
      practiceSessionId: null,
      selectedChoiceId: q2.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 5,
    });

    const since = new Date('2000-01-01T00:00:00.000Z');

    // While exam is active: only adhoc attempt counted
    await expect(attemptRepo.countByUserId(user.id)).resolves.toBe(1);
    await expect(attemptRepo.countCorrectByUserId(user.id)).resolves.toBe(1);
    await expect(attemptRepo.countByUserIdSince(user.id, since)).resolves.toBe(
      1,
    );
    await expect(
      attemptRepo.countCorrectByUserIdSince(user.id, since),
    ).resolves.toBe(1);

    // End the exam
    await sessionRepo.end(examSession.id, user.id);

    // After exam ends: both attempts counted
    await expect(attemptRepo.countByUserId(user.id)).resolves.toBe(2);
    await expect(attemptRepo.countCorrectByUserId(user.id)).resolves.toBe(2);
    await expect(attemptRepo.countByUserIdSince(user.id, since)).resolves.toBe(
      2,
    );
    await expect(
      attemptRepo.countCorrectByUserIdSince(user.id, since),
    ).resolves.toBe(2);
  });

  it('excludes active-exam attempts from listRecentByUserId', async () => {
    const user = await createUser(db, cleanup);
    const q1 = await createQuestion(db, cleanup, {
      slug: `it-recent-exam-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const q2 = await createQuestion(db, cleanup, {
      slug: `it-recent-adhoc-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const attemptRepo = new DrizzleAttemptRepository(db);

    const examSession = await sessionRepo.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [q1.id],
      },
    });

    await attemptRepo.insert({
      userId: user.id,
      questionId: q1.id,
      practiceSessionId: examSession.id,
      selectedChoiceId: q1.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 5,
    });

    await attemptRepo.insert({
      userId: user.id,
      questionId: q2.id,
      practiceSessionId: null,
      selectedChoiceId: q2.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 5,
    });

    // While exam is active: only adhoc attempt in recent list
    const activeRecent = await attemptRepo.listRecentByUserId(user.id, 10);
    expect(activeRecent).toHaveLength(1);
    expect(activeRecent[0]?.questionId).toBe(q2.id);

    // End the exam
    await sessionRepo.end(examSession.id, user.id);

    // After exam ends: both in recent list
    const endedRecent = await attemptRepo.listRecentByUserId(user.id, 10);
    expect(endedRecent).toHaveLength(2);
  });

  it('includes tutor-session attempts in counts', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-count-tutor-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const attemptRepo = new DrizzleAttemptRepository(db);

    const tutorSession = await sessionRepo.create({
      userId: user.id,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });

    await attemptRepo.insert({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: tutorSession.id,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 5,
    });

    // Tutor attempts always counted, even while session is active
    await expect(attemptRepo.countByUserId(user.id)).resolves.toBe(1);
    await expect(attemptRepo.countCorrectByUserId(user.id)).resolves.toBe(1);
  });
});

// ---------------------------------------------------------------------------
// BUG-192: History attempted-questions excludes active-exam attempts
// ---------------------------------------------------------------------------
describe('BUG-192: Attempted-question history excludes active-exam attempts', () => {
  it('excludes active-exam attempts from attempted-question list and count until the exam ends', async () => {
    const user = await createUser(db, cleanup);
    const qExam = await createQuestion(db, cleanup, {
      slug: `it-attempted-exam-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const qAdhoc = await createQuestion(db, cleanup, {
      slug: `it-attempted-adhoc-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const attemptRepo = new DrizzleAttemptRepository(db);

    const examSession = await sessionRepo.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [qExam.id],
      },
    });

    await attemptRepo.insert({
      userId: user.id,
      questionId: qExam.id,
      practiceSessionId: examSession.id,
      selectedChoiceId: qExam.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 5,
    });

    await attemptRepo.insert({
      userId: user.id,
      questionId: qAdhoc.id,
      practiceSessionId: null,
      selectedChoiceId: qAdhoc.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 5,
    });

    const activeAttempted = await attemptRepo.listAttemptedQuestionsByUserId(
      user.id,
      10,
      0,
    );
    expect(activeAttempted).toHaveLength(1);
    expect(activeAttempted[0]?.questionId).toBe(qAdhoc.id);
    await expect(
      attemptRepo.countAttemptedQuestionsByUserId(user.id),
    ).resolves.toBe(1);

    await sessionRepo.end(examSession.id, user.id);

    const endedAttempted = await attemptRepo.listAttemptedQuestionsByUserId(
      user.id,
      10,
      0,
    );
    expect(endedAttempted).toHaveLength(2);
    expect(endedAttempted.map((row) => row.questionId)).toEqual(
      expect.arrayContaining([qAdhoc.id, qExam.id]),
    );
    await expect(
      attemptRepo.countAttemptedQuestionsByUserId(user.id),
    ).resolves.toBe(2);
  });
});

// BUG-195: Question candidate status filters exclude active-exam attempts
describe('BUG-195: Question candidate status filters exclude active-exam attempts', () => {
  it('excludes active-exam attempts from unanswered/incorrect status filters until the exam ends', async () => {
    const user = await createUser(db, cleanup);
    const questionRepo = new DrizzleQuestionRepository(db);
    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const attemptRepo = new DrizzleAttemptRepository(db);
    const tag = await createTag(db, cleanup, {
      slug: `it-bug195-tag-${randomUUID()}`,
      kind: 'topic',
    });

    const qExamIncorrect = await createQuestion(db, cleanup, {
      slug: `it-bug195-exam-incorrect-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      tagIds: [tag.id],
    });
    const qAdhocIncorrect = await createQuestion(db, cleanup, {
      slug: `it-bug195-adhoc-incorrect-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
      tagIds: [tag.id],
    });
    const qAdhocCorrect = await createQuestion(db, cleanup, {
      slug: `it-bug195-adhoc-correct-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
      createdAt: new Date('2026-01-03T00:00:00.000Z'),
      tagIds: [tag.id],
    });
    const qNeverAnswered = await createQuestion(db, cleanup, {
      slug: `it-bug195-never-answered-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
      createdAt: new Date('2026-01-04T00:00:00.000Z'),
      tagIds: [tag.id],
    });

    const [qExamIncorrectChoiceA] = await db
      .select({ id: schema.choices.id })
      .from(schema.choices)
      .where(
        and(
          eq(schema.choices.questionId, qExamIncorrect.id),
          eq(schema.choices.label, 'A'),
        ),
      )
      .limit(1);
    if (!qExamIncorrectChoiceA) {
      throw new Error('Failed to load exam incorrect choice for BUG-195 setup');
    }

    const [qAdhocIncorrectChoiceA] = await db
      .select({ id: schema.choices.id })
      .from(schema.choices)
      .where(
        and(
          eq(schema.choices.questionId, qAdhocIncorrect.id),
          eq(schema.choices.label, 'A'),
        ),
      )
      .limit(1);
    if (!qAdhocIncorrectChoiceA) {
      throw new Error(
        'Failed to load adhoc incorrect choice for BUG-195 setup',
      );
    }

    const examSession = await sessionRepo.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [qExamIncorrect.id],
      },
    });

    await attemptRepo.insert({
      userId: user.id,
      questionId: qExamIncorrect.id,
      practiceSessionId: examSession.id,
      selectedChoiceId: qExamIncorrectChoiceA.id,
      isCorrect: false,
      timeSpentSeconds: 0,
    });
    await attemptRepo.insert({
      userId: user.id,
      questionId: qAdhocIncorrect.id,
      practiceSessionId: null,
      selectedChoiceId: qAdhocIncorrectChoiceA.id,
      isCorrect: false,
      timeSpentSeconds: 0,
    });
    await attemptRepo.insert({
      userId: user.id,
      questionId: qAdhocCorrect.id,
      practiceSessionId: null,
      selectedChoiceId: qAdhocCorrect.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 0,
    });

    const activeUnanswered = await questionRepo.listPublishedCandidateIds({
      tagSlugs: [tag.slug],
      difficulties: [],
      statuses: ['unanswered'],
      userId: user.id,
    });
    expect(new Set(activeUnanswered)).toEqual(
      new Set([qNeverAnswered.id, qExamIncorrect.id]),
    );
    await expect(
      questionRepo.countPublishedCandidateIds({
        tagSlugs: [tag.slug],
        difficulties: [],
        statuses: ['unanswered'],
        userId: user.id,
      }),
    ).resolves.toBe(2);

    const activeIncorrect = await questionRepo.listPublishedCandidateIds({
      tagSlugs: [tag.slug],
      difficulties: [],
      statuses: ['incorrect'],
      userId: user.id,
    });
    expect(activeIncorrect).toEqual([qAdhocIncorrect.id]);
    await expect(
      questionRepo.countPublishedCandidateIds({
        tagSlugs: [tag.slug],
        difficulties: [],
        statuses: ['incorrect'],
        userId: user.id,
      }),
    ).resolves.toBe(1);

    await sessionRepo.end(examSession.id, user.id);

    const endedUnanswered = await questionRepo.listPublishedCandidateIds({
      tagSlugs: [tag.slug],
      difficulties: [],
      statuses: ['unanswered'],
      userId: user.id,
    });
    expect(endedUnanswered).toEqual([qNeverAnswered.id]);
    await expect(
      questionRepo.countPublishedCandidateIds({
        tagSlugs: [tag.slug],
        difficulties: [],
        statuses: ['unanswered'],
        userId: user.id,
      }),
    ).resolves.toBe(1);

    const endedIncorrect = await questionRepo.listPublishedCandidateIds({
      tagSlugs: [tag.slug],
      difficulties: [],
      statuses: ['incorrect'],
      userId: user.id,
    });
    expect(new Set(endedIncorrect)).toEqual(
      new Set([qExamIncorrect.id, qAdhocIncorrect.id]),
    );
    await expect(
      questionRepo.countPublishedCandidateIds({
        tagSlugs: [tag.slug],
        difficulties: [],
        statuses: ['incorrect'],
        userId: user.id,
      }),
    ).resolves.toBe(2);
  });
});

// ---------------------------------------------------------------------------
// BUG-188: CAS comparison works with legacy params_json (no questionStates)
// ---------------------------------------------------------------------------
describe('BUG-188: CAS works with legacy JSON shapes', () => {
  it('succeeds CAS on legacy params_json without questionStates key', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-legacy-cas-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    // Insert session with legacy JSON shape (no questionStates key)
    const legacyParamsJson: PracticeSessionParams = {
      count: 1,
      tagSlugs: [],
      difficulties: [],
      questionIds: [question.id],
    };

    const [row] = await db
      .insert(schema.practiceSessions)
      .values({
        userId: user.id,
        mode: 'tutor',
        paramsJson: legacyParamsJson,
      })
      .returning({ id: schema.practiceSessions.id });

    if (!row) throw new Error('Failed to insert legacy session');

    const sessionRepo = new DrizzlePracticeSessionRepository(db);

    // CAS must succeed on first try despite legacy shape
    await expect(
      sessionRepo.recordQuestionAnswer({
        sessionId: row.id,
        userId: user.id,
        questionId: question.id,
        selectedChoiceId: question.correctChoiceId,
        isCorrect: true,
        answeredAt: new Date(),
      }),
    ).resolves.toMatchObject({
      questionId: question.id,
      latestIsCorrect: true,
    });

    // Verify the row is upgraded to include questionStates
    const updatedRow = await db.query.practiceSessions.findFirst({
      where: eq(schema.practiceSessions.id, row.id),
    });
    expect(updatedRow?.paramsJson).toHaveProperty('questionStates');
  });

  it('succeeds CAS on current-format params_json with questionStates', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-current-cas-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    // Use the normal create path which produces current-format JSON
    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const session = await sessionRepo.create({
      userId: user.id,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });

    // CAS must succeed on current-format shape
    await expect(
      sessionRepo.recordQuestionAnswer({
        sessionId: session.id,
        userId: user.id,
        questionId: question.id,
        selectedChoiceId: question.correctChoiceId,
        isCorrect: true,
        answeredAt: new Date(),
      }),
    ).resolves.toMatchObject({
      questionId: question.id,
      latestIsCorrect: true,
    });
  });

  it('succeeds CAS for setQuestionMarkedForReview with legacy params_json', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-legacy-mark-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    // Insert session with legacy JSON shape
    const legacyParamsJson: PracticeSessionParams = {
      count: 1,
      tagSlugs: [],
      difficulties: [],
      questionIds: [question.id],
    };

    const [row] = await db
      .insert(schema.practiceSessions)
      .values({
        userId: user.id,
        mode: 'exam',
        paramsJson: legacyParamsJson,
      })
      .returning({ id: schema.practiceSessions.id });

    if (!row) throw new Error('Failed to insert legacy session');

    const sessionRepo = new DrizzlePracticeSessionRepository(db);

    // setQuestionMarkedForReview should also work with legacy shape
    await expect(
      sessionRepo.setQuestionMarkedForReview({
        sessionId: row.id,
        userId: user.id,
        questionId: question.id,
        markedForReview: true,
      }),
    ).resolves.toMatchObject({
      questionId: question.id,
      markedForReview: true,
    });
  });
});
