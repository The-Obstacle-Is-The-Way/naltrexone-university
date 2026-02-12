import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { DrizzleRateLimiter } from '@/src/adapters/gateways/drizzle-rate-limiter';
import { DrizzleAttemptRepository } from '@/src/adapters/repositories/drizzle-attempt-repository';
import { DrizzleBookmarkRepository } from '@/src/adapters/repositories/drizzle-bookmark-repository';
import { DrizzleIdempotencyKeyRepository } from '@/src/adapters/repositories/drizzle-idempotency-key-repository';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import { DrizzleQuestionRepository } from '@/src/adapters/repositories/drizzle-question-repository';
import { DrizzleStripeCustomerRepository } from '@/src/adapters/repositories/drizzle-stripe-customer-repository';
import { DrizzleStripeEventRepository } from '@/src/adapters/repositories/drizzle-stripe-event-repository';
import { DrizzleSubscriptionRepository } from '@/src/adapters/repositories/drizzle-subscription-repository';
import { DrizzleTagRepository } from '@/src/adapters/repositories/drizzle-tag-repository';
import { DrizzleUserRepository } from '@/src/adapters/repositories/drizzle-user-repository';
import { ApplicationError } from '@/src/application/errors';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is required to run integration tests. Did you forget to set it?',
  );
}

const allowNonLocal = process.env.ALLOW_NON_LOCAL_DATABASE_URL === 'true';
const host = new URL(databaseUrl).hostname;
const isLocalhost =
  host === 'localhost' || host === '127.0.0.1' || host === '::1';
if (!allowNonLocal && !isLocalhost) {
  throw new Error(
    `Refusing to run integration tests against non-local DATABASE_URL host "${host}". Set DATABASE_URL to a local Postgres (recommended: Docker) or export ALLOW_NON_LOCAL_DATABASE_URL=true to override.`,
  );
}

const sql = postgres(databaseUrl, { max: 1 });
const db = drizzle(sql, { schema });

type CleanupState = {
  rateLimitKeys: string[];
  userIds: string[];
  questionIds: string[];
  tagIds: string[];
  stripeEventIds: string[];
};

const cleanup: CleanupState = {
  rateLimitKeys: [],
  userIds: [],
  questionIds: [],
  tagIds: [],
  stripeEventIds: [],
};

async function createUser(): Promise<{ id: string; email: string }> {
  const email = `it-${randomUUID()}@example.com`;
  const clerkUserId = `user_${randomUUID().replaceAll('-', '')}`;

  const [row] = await db
    .insert(schema.users)
    .values({ email, clerkUserId })
    .returning({ id: schema.users.id, email: schema.users.email });

  if (!row) {
    throw new Error('Failed to insert user');
  }

  cleanup.userIds.push(row.id);
  return row;
}

async function createTag(input: {
  slug: string;
  kind: schema.TagKind;
  name?: string;
}): Promise<{ id: string; slug: string }> {
  const [row] = await db
    .insert(schema.tags)
    .values({
      slug: input.slug,
      kind: input.kind,
      name: input.name ?? input.slug,
    })
    .returning({ id: schema.tags.id, slug: schema.tags.slug });

  if (!row) {
    throw new Error('Failed to insert tag');
  }

  cleanup.tagIds.push(row.id);
  return row;
}

async function createQuestion(input: {
  id?: string;
  slug: string;
  status: schema.QuestionStatus;
  difficulty: schema.QuestionDifficulty;
  createdAt?: Date;
  tagIds?: readonly string[];
}): Promise<{ id: string; slug: string; correctChoiceId: string }> {
  const createdAt = input.createdAt ?? new Date();
  const updatedAt = createdAt;

  const questionValues: typeof schema.questions.$inferInsert = {
    slug: input.slug,
    stemMd: '# Stem',
    explanationMd: '# Explanation',
    status: input.status,
    difficulty: input.difficulty,
    createdAt,
    updatedAt,
  };

  if (input.id) {
    questionValues.id = input.id;
  }

  const [question] = await db
    .insert(schema.questions)
    .values(questionValues)
    .returning({ id: schema.questions.id });

  if (!question) {
    throw new Error('Failed to insert question');
  }

  cleanup.questionIds.push(question.id);

  const [choiceA, choiceB] = await db
    .insert(schema.choices)
    .values([
      {
        questionId: question.id,
        label: 'A',
        textMd: 'Choice A',
        isCorrect: false,
        sortOrder: 1,
      },
      {
        questionId: question.id,
        label: 'B',
        textMd: 'Choice B',
        isCorrect: true,
        sortOrder: 2,
      },
    ])
    .returning({ id: schema.choices.id });

  if (!choiceA || !choiceB) {
    throw new Error('Failed to insert choices');
  }

  if (input.tagIds && input.tagIds.length > 0) {
    await db.insert(schema.questionTags).values(
      input.tagIds.map((tagId) => ({
        questionId: question.id,
        tagId,
      })),
    );
  }

  return { id: question.id, slug: input.slug, correctChoiceId: choiceB.id };
}

afterEach(async () => {
  if (cleanup.stripeEventIds.length > 0) {
    await db
      .delete(schema.stripeEvents)
      .where(inArray(schema.stripeEvents.id, cleanup.stripeEventIds));
  }

  if (cleanup.rateLimitKeys.length > 0) {
    await db
      .delete(schema.rateLimits)
      .where(inArray(schema.rateLimits.key, cleanup.rateLimitKeys));
  }

  if (cleanup.userIds.length > 0) {
    await db
      .delete(schema.users)
      .where(inArray(schema.users.id, cleanup.userIds));
  }

  if (cleanup.questionIds.length > 0) {
    await db
      .delete(schema.questions)
      .where(inArray(schema.questions.id, cleanup.questionIds));
  }

  if (cleanup.tagIds.length > 0) {
    await db.delete(schema.tags).where(inArray(schema.tags.id, cleanup.tagIds));
  }

  cleanup.userIds.length = 0;
  cleanup.questionIds.length = 0;
  cleanup.tagIds.length = 0;
  cleanup.stripeEventIds.length = 0;
  cleanup.rateLimitKeys.length = 0;
});

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

describe('DrizzleQuestionRepository', () => {
  it('returns null for non-published questions', async () => {
    const tag = await createTag({
      slug: `it-tag-${randomUUID()}`,
      kind: 'topic',
    });
    const { id, slug } = await createQuestion({
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
    const publishedA = await createQuestion({
      slug: `it-pub-a-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const draft = await createQuestion({
      slug: `it-draft-${randomUUID()}`,
      status: 'draft',
      difficulty: 'easy',
    });

    const publishedB = await createQuestion({
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
    const tag = await createTag({ slug: tagSlug, kind: 'topic' });

    const createdAt = new Date('2026-01-01T00:00:00.000Z');

    const q1Id = '00000000-0000-0000-0000-000000000001';
    const q2Id = '00000000-0000-0000-0000-000000000002';

    const q1 = await createQuestion({
      id: q1Id,
      slug: `it-q1-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
      createdAt,
      tagIds: [tag.id],
    });

    const q2 = await createQuestion({
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

  describe('listPublishedCandidateIds with status filters', () => {
    it('returns only unanswered questions when status=unanswered', async () => {
      const user = await createUser();

      const qAttempted = await createQuestion({
        id: '00000000-0000-0000-0000-000000000011',
        slug: `it-attempted-${randomUUID()}`,
        status: 'published',
        difficulty: 'easy',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      const qUnanswered = await createQuestion({
        id: '00000000-0000-0000-0000-000000000012',
        slug: `it-unanswered-${randomUUID()}`,
        status: 'published',
        difficulty: 'easy',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
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
        tagSlugs: [],
        difficulties: [],
        statuses: ['unanswered'],
        userId: user.id,
      });

      expect(result).toEqual([qUnanswered.id]);
    });

    it('returns only questions with latest attempt incorrect when status=incorrect', async () => {
      const user = await createUser();

      const qLatestIncorrect = await createQuestion({
        id: '00000000-0000-0000-0000-000000000021',
        slug: `it-latest-incorrect-${randomUUID()}`,
        status: 'published',
        difficulty: 'easy',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      const qLatestCorrect = await createQuestion({
        id: '00000000-0000-0000-0000-000000000022',
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
        throw new Error('Failed to load incorrect choice for setup');
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

    it('returns only bookmarked questions when status=marked', async () => {
      const user = await createUser();

      const qMarked = await createQuestion({
        id: '00000000-0000-0000-0000-000000000031',
        slug: `it-marked-${randomUUID()}`,
        status: 'published',
        difficulty: 'easy',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      const qUnmarked = await createQuestion({
        id: '00000000-0000-0000-0000-000000000032',
        slug: `it-unmarked-${randomUUID()}`,
        status: 'published',
        difficulty: 'easy',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      await db.insert(schema.bookmarks).values({
        userId: user.id,
        questionId: qMarked.id,
      });

      const repo = new DrizzleQuestionRepository(db);
      const result = await repo.listPublishedCandidateIds({
        tagSlugs: [],
        difficulties: [],
        statuses: ['marked'],
        userId: user.id,
      });

      expect(result).toEqual([qMarked.id]);
      expect(result).not.toContain(qUnmarked.id);
    });

    it('combines unanswered and incorrect with OR logic', async () => {
      const user = await createUser();

      const qIncorrect = await createQuestion({
        id: '00000000-0000-0000-0000-000000000041',
        slug: `it-or-incorrect-${randomUUID()}`,
        status: 'published',
        difficulty: 'easy',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      const qUnanswered = await createQuestion({
        id: '00000000-0000-0000-0000-000000000042',
        slug: `it-or-unanswered-${randomUUID()}`,
        status: 'published',
        difficulty: 'easy',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      });
      const qCorrect = await createQuestion({
        id: '00000000-0000-0000-0000-000000000043',
        slug: `it-or-correct-${randomUUID()}`,
        status: 'published',
        difficulty: 'easy',
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
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
        tagSlugs: [],
        difficulties: [],
        statuses: ['unanswered', 'incorrect'],
        userId: user.id,
      });

      expect(new Set(result)).toEqual(new Set([qUnanswered.id, qIncorrect.id]));
      expect(result).not.toContain(qCorrect.id);
    });

    it('returns all questions when statuses is empty', async () => {
      const user = await createUser();

      const q1 = await createQuestion({
        id: '00000000-0000-0000-0000-000000000051',
        slug: `it-all-1-${randomUUID()}`,
        status: 'published',
        difficulty: 'easy',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      const q2 = await createQuestion({
        id: '00000000-0000-0000-0000-000000000052',
        slug: `it-all-2-${randomUUID()}`,
        status: 'published',
        difficulty: 'hard',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      const repo = new DrizzleQuestionRepository(db);
      const result = await repo.listPublishedCandidateIds({
        tagSlugs: [],
        difficulties: [],
        statuses: [],
        userId: user.id,
      });

      expect(result).toEqual([q2.id, q1.id]);
    });

    it('combines status filter with difficulty filter (AND logic)', async () => {
      const user = await createUser();

      const qMarkedEasy = await createQuestion({
        id: '00000000-0000-0000-0000-000000000061',
        slug: `it-marked-easy-${randomUUID()}`,
        status: 'published',
        difficulty: 'easy',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      const qMarkedHard = await createQuestion({
        id: '00000000-0000-0000-0000-000000000062',
        slug: `it-marked-hard-${randomUUID()}`,
        status: 'published',
        difficulty: 'hard',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      await db.insert(schema.bookmarks).values([
        { userId: user.id, questionId: qMarkedEasy.id },
        { userId: user.id, questionId: qMarkedHard.id },
      ]);

      const repo = new DrizzleQuestionRepository(db);
      const result = await repo.listPublishedCandidateIds({
        tagSlugs: [],
        difficulties: ['easy'],
        statuses: ['marked'],
        userId: user.id,
      });

      expect(result).toEqual([qMarkedEasy.id]);
    });

    it('combines status filter with tag filter (AND logic)', async () => {
      const user = await createUser();
      const tag = await createTag({
        slug: `it-tag-${randomUUID()}`,
        kind: 'topic',
      });

      const qTagged = await createQuestion({
        id: '00000000-0000-0000-0000-000000000071',
        slug: `it-tagged-${randomUUID()}`,
        status: 'published',
        difficulty: 'easy',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        tagIds: [tag.id],
      });
      const qUntagged = await createQuestion({
        id: '00000000-0000-0000-0000-000000000072',
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
        statuses: ['marked'],
        userId: user.id,
      });

      expect(result).toEqual([qTagged.id]);
    });
  });
});

describe('DrizzlePracticeSessionRepository + DrizzleAttemptRepository', () => {
  it('inserts attempts and enforces user scoping on findBySessionId', async () => {
    const userA = await createUser();
    const userB = await createUser();

    const question = await createQuestion({
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
    const user = await createUser();
    const question = await createQuestion({
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
    const user = await createUser();
    const question = await createQuestion({
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
    const user = await createUser();
    const question = await createQuestion({
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

  it('rejects deleting a choice referenced by an attempt', async () => {
    const user = await createUser();
    const question = await createQuestion({
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
    const user = await createUser();
    const question = await createQuestion({
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
    const user = await createUser();

    const q1 = await createQuestion({
      slug: `it-q1-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const q2 = await createQuestion({
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
    const user = await createUser();

    const q1 = await createQuestion({
      slug: `it-attempted-q1-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const q2 = await createQuestion({
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

  it('uses id desc as deterministic tie-breaker for latest attempted-question semantics', async () => {
    const user = await createUser();

    const qTie = await createQuestion({
      slug: `it-attempted-tie-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const qIncorrect = await createQuestion({
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

describe('DrizzleBookmarkRepository', () => {
  it('adds/removes bookmarks idempotently', async () => {
    const user = await createUser();
    const question = await createQuestion({
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
});

describe('Stripe repositories', () => {
  it('persists Stripe events with idempotency and processed tracking', async () => {
    const eventId = `evt_${randomUUID().replaceAll('-', '')}`;
    cleanup.stripeEventIds.push(eventId);

    const repo = new DrizzleStripeEventRepository(db);

    expect(await repo.claim(eventId, 'checkout.session.completed')).toBe(true);
    await expect(repo.lock(eventId)).resolves.toEqual({
      processedAt: null,
      error: null,
    });

    await repo.markProcessed(eventId);
    await expect(repo.lock(eventId)).resolves.toMatchObject({
      processedAt: expect.any(Date),
      error: null,
    });

    expect(await repo.claim(eventId, 'checkout.session.completed')).toBe(false);

    await repo.markFailed(eventId, 'boom');
    await expect(repo.lock(eventId)).resolves.toEqual({
      processedAt: null,
      error: 'boom',
    });
  });

  it('upserts Stripe customers per user', async () => {
    const user = await createUser();
    const otherUser = await createUser();
    const repo = new DrizzleStripeCustomerRepository(db);

    await repo.insert(user.id, 'cus_123');
    await expect(repo.findByUserId(user.id)).resolves.toEqual({
      stripeCustomerId: 'cus_123',
    });

    await repo.insert(user.id, 'cus_123');

    await expect(repo.insert(otherUser.id, 'cus_123')).rejects.toMatchObject({
      code: 'CONFLICT',
    });

    await expect(repo.insert(user.id, 'cus_456')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('maps Stripe price ids to domain plan when loading subscriptions', async () => {
    const user = await createUser();

    const priceIds = {
      monthly: 'price_test_monthly',
      annual: 'price_test_annual',
    } as const;

    const repo = new DrizzleSubscriptionRepository(db, priceIds);

    const [inserted] = await db
      .insert(schema.stripeSubscriptions)
      .values({
        userId: user.id,
        stripeSubscriptionId: `sub_${randomUUID().replaceAll('-', '')}`,
        status: 'active',
        priceId: priceIds.monthly,
        currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
      })
      .returning({ id: schema.stripeSubscriptions.id });

    if (!inserted) throw new Error('Failed to insert subscription');

    const subscription = await repo.findByUserId(user.id);
    expect(subscription?.plan).toBe('monthly');

    await db
      .update(schema.stripeSubscriptions)
      .set({ priceId: 'price_unknown' })
      .where(eq(schema.stripeSubscriptions.id, inserted.id));

    await expect(repo.findByUserId(user.id)).rejects.toBeInstanceOf(
      ApplicationError,
    );
  });

  it('upserts subscriptions per user and supports lookup by externalSubscriptionId', async () => {
    const user = await createUser();

    const priceIds = {
      monthly: 'price_test_monthly',
      annual: 'price_test_annual',
    } as const;

    const repo = new DrizzleSubscriptionRepository(db, priceIds);

    const stripeSubscriptionId1 = `sub_${randomUUID().replaceAll('-', '')}`;
    const periodEnd1 = new Date('2026-12-31T00:00:00.000Z');

    await repo.upsert({
      userId: user.id,
      externalSubscriptionId: stripeSubscriptionId1,
      status: 'active',
      plan: 'monthly',
      currentPeriodEnd: periodEnd1,
      cancelAtPeriodEnd: false,
    });

    const byUser1 = await repo.findByUserId(user.id);
    expect(byUser1).toMatchObject({
      userId: user.id,
      plan: 'monthly',
      status: 'active',
      currentPeriodEnd: periodEnd1,
      cancelAtPeriodEnd: false,
    });

    const byStripeSubId1 = await repo.findByExternalSubscriptionId(
      stripeSubscriptionId1,
    );
    expect(byStripeSubId1?.userId).toBe(user.id);

    const stripeSubscriptionId2 = `sub_${randomUUID().replaceAll('-', '')}`;
    const periodEnd2 = new Date('2027-01-31T00:00:00.000Z');

    await repo.upsert({
      userId: user.id,
      externalSubscriptionId: stripeSubscriptionId2,
      status: 'canceled',
      plan: 'annual',
      currentPeriodEnd: periodEnd2,
      cancelAtPeriodEnd: true,
    });

    const byUser2 = await repo.findByUserId(user.id);
    expect(byUser2).toMatchObject({
      userId: user.id,
      plan: 'annual',
      status: 'canceled',
      currentPeriodEnd: periodEnd2,
      cancelAtPeriodEnd: true,
    });

    await expect(
      repo.findByExternalSubscriptionId(stripeSubscriptionId1),
    ).resolves.toBeNull();
    await expect(
      repo.findByExternalSubscriptionId(stripeSubscriptionId2),
    ).resolves.toMatchObject({
      userId: user.id,
    });
  });

  it('throws CONFLICT when externalSubscriptionId is already mapped to a different user', async () => {
    const userA = await createUser();
    const userB = await createUser();

    const priceIds = {
      monthly: 'price_test_monthly',
      annual: 'price_test_annual',
    } as const;

    const repo = new DrizzleSubscriptionRepository(db, priceIds);
    const stripeSubscriptionId = `sub_${randomUUID().replaceAll('-', '')}`;

    await repo.upsert({
      userId: userA.id,
      externalSubscriptionId: stripeSubscriptionId,
      status: 'active',
      plan: 'monthly',
      currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
    });

    await expect(
      repo.upsert({
        userId: userB.id,
        externalSubscriptionId: stripeSubscriptionId,
        status: 'active',
        plan: 'monthly',
        currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('DrizzleUserRepository', () => {
  it('upserts users by clerk id and can find them', async () => {
    const repo = new DrizzleUserRepository(db);
    const clerkUserId = `user_${randomUUID().replaceAll('-', '')}`;
    const email = `it-${randomUUID()}@example.com`;

    const user = await repo.upsertByClerkId(clerkUserId, email);
    cleanup.userIds.push(user.id);

    await expect(repo.findByClerkId(clerkUserId)).resolves.toMatchObject({
      id: user.id,
      email,
    });
  });

  it('updates email when upserting an existing user', async () => {
    const repo = new DrizzleUserRepository(db);
    const clerkUserId = `user_${randomUUID().replaceAll('-', '')}`;

    const first = await repo.upsertByClerkId(
      clerkUserId,
      `it-${randomUUID()}@example.com`,
    );
    cleanup.userIds.push(first.id);

    const secondEmail = `it-${randomUUID()}@example.com`;
    const second = await repo.upsertByClerkId(clerkUserId, secondEmail);

    expect(second).toMatchObject({
      id: first.id,
      email: secondEmail,
    });
  });

  it('deletes by clerk id and returns false when missing', async () => {
    const repo = new DrizzleUserRepository(db);
    await expect(repo.deleteByClerkId('user_missing')).resolves.toBe(false);

    const clerkUserId = `user_${randomUUID().replaceAll('-', '')}`;
    const user = await repo.upsertByClerkId(
      clerkUserId,
      `it-${randomUUID()}@example.com`,
    );
    cleanup.userIds.push(user.id);

    await expect(repo.deleteByClerkId(clerkUserId)).resolves.toBe(true);
    await expect(repo.findByClerkId(clerkUserId)).resolves.toBeNull();
  });
});

describe('DrizzleIdempotencyKeyRepository', () => {
  it('claims keys and stores results + errors', async () => {
    const user = await createUser();
    const now = () => new Date('2026-02-01T00:00:00.000Z');
    const repo = new DrizzleIdempotencyKeyRepository(db, now);

    const expiresAt = new Date('2026-02-02T00:00:00.000Z');

    await expect(
      repo.claim({ userId: user.id, action: 'it', key: 'k1', expiresAt }),
    ).resolves.toBe(true);

    await repo.storeResult({
      userId: user.id,
      action: 'it',
      key: 'k1',
      resultJson: { ok: true },
    });

    await expect(repo.find(user.id, 'it', 'k1')).resolves.toMatchObject({
      resultJson: { ok: true },
      error: null,
      expiresAt,
    });

    await expect(
      repo.claim({ userId: user.id, action: 'it', key: 'k2', expiresAt }),
    ).resolves.toBe(true);

    await repo.storeError({
      userId: user.id,
      action: 'it',
      key: 'k2',
      error: { code: 'INTERNAL_ERROR', message: 'boom' },
    });

    await expect(repo.find(user.id, 'it', 'k2')).resolves.toMatchObject({
      resultJson: null,
      error: { code: 'INTERNAL_ERROR', message: 'boom' },
      expiresAt,
    });
  });

  it('reclaims expired keys and resets stored state', async () => {
    const user = await createUser();
    const now = () => new Date('2026-02-01T00:00:10.000Z');
    const repo = new DrizzleIdempotencyKeyRepository(db, now);

    const expiredAt = new Date('2026-02-01T00:00:00.000Z');
    await expect(
      repo.claim({
        userId: user.id,
        action: 'it',
        key: 'k3',
        expiresAt: expiredAt,
      }),
    ).resolves.toBe(true);

    await repo.storeResult({
      userId: user.id,
      action: 'it',
      key: 'k3',
      resultJson: { ok: true },
    });

    const refreshedAt = new Date('2026-02-02T00:00:00.000Z');
    await expect(
      repo.claim({
        userId: user.id,
        action: 'it',
        key: 'k3',
        expiresAt: refreshedAt,
      }),
    ).resolves.toBe(true);

    await expect(repo.find(user.id, 'it', 'k3')).resolves.toMatchObject({
      resultJson: null,
      error: null,
      expiresAt: refreshedAt,
    });
  });
});

describe('DrizzleRateLimiter', () => {
  it('increments within a window and rejects over the limit', async () => {
    const now = () => new Date('2026-02-01T00:00:01.500Z');
    const limiter = new DrizzleRateLimiter(db, now);
    const key = `it-rate:${randomUUID()}`;
    cleanup.rateLimitKeys.push(key);

    const input = { key, limit: 2, windowMs: 1000 };

    await expect(limiter.limit(input)).resolves.toMatchObject({
      success: true,
      remaining: 1,
      retryAfterSeconds: 1,
    });
    await expect(limiter.limit(input)).resolves.toMatchObject({
      success: true,
      remaining: 0,
      retryAfterSeconds: 1,
    });
    await expect(limiter.limit(input)).resolves.toMatchObject({
      success: false,
      remaining: 0,
      retryAfterSeconds: 1,
    });
  });
});

describe('DrizzleTagRepository', () => {
  it('lists tags ordered by kind then slug, excluding orphaned tags', async () => {
    const domainSlug = `a-domain-${randomUUID()}`;
    const topicSlugA = `a-topic-${randomUUID()}`;
    const topicSlugB = `b-topic-${randomUUID()}`;
    const orphanSlug = `orphan-${randomUUID()}`;

    const domain = await createTag({ slug: domainSlug, kind: 'domain' });
    const topicB = await createTag({ slug: topicSlugB, kind: 'topic' });
    const topicA = await createTag({ slug: topicSlugA, kind: 'topic' });
    await createTag({ slug: orphanSlug, kind: 'topic' });

    await createQuestion({
      slug: `q-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
      tagIds: [domain.id, topicA.id, topicB.id],
    });

    const repo = new DrizzleTagRepository(db);
    const all = await repo.listAll();

    const slugs = all.map((t) => t.slug);
    const domainIndex = slugs.indexOf(domainSlug);
    const topicIndexA = slugs.indexOf(topicSlugA);
    const topicIndexB = slugs.indexOf(topicSlugB);

    expect(domainIndex).toBeGreaterThanOrEqual(0);
    expect(topicIndexA).toBeGreaterThanOrEqual(0);
    expect(topicIndexB).toBeGreaterThanOrEqual(0);

    expect(domainIndex).toBeLessThan(topicIndexA);
    expect(topicIndexA).toBeLessThan(topicIndexB);

    expect(slugs).not.toContain(orphanSlug);
  });
});
