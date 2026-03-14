import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import type { ClerkWebhookEvent } from '@/src/adapters/controllers/clerk-webhook-controller';
import { processClerkWebhook } from '@/src/adapters/controllers/clerk-webhook-controller';
import type { QuestionControllerDeps } from '@/src/adapters/controllers/question-controller';
import {
  getNextQuestion,
  submitAnswer,
} from '@/src/adapters/controllers/question-controller';
import { getAttemptedQuestions } from '@/src/adapters/controllers/review-controller';
import { getUserStats } from '@/src/adapters/controllers/stats-controller';
import type { StripeWebhookInput } from '@/src/adapters/controllers/stripe-webhook-controller';
import { processStripeWebhook } from '@/src/adapters/controllers/stripe-webhook-controller';
import { DrizzleAttemptRepository } from '@/src/adapters/repositories/drizzle-attempt-repository';
import { DrizzleClerkEventRepository } from '@/src/adapters/repositories/drizzle-clerk-event-repository';
import { DrizzleDeletedClerkUserRepository } from '@/src/adapters/repositories/drizzle-deleted-clerk-user-repository';
import { DrizzleIdempotencyKeyRepository } from '@/src/adapters/repositories/drizzle-idempotency-key-repository';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import { DrizzleQuestionRepository } from '@/src/adapters/repositories/drizzle-question-repository';
import { DrizzleStripeCustomerRepository } from '@/src/adapters/repositories/drizzle-stripe-customer-repository';
import { DrizzleStripeEventRepository } from '@/src/adapters/repositories/drizzle-stripe-event-repository';
import { DrizzleSubscriptionRepository } from '@/src/adapters/repositories/drizzle-subscription-repository';
import { DrizzleUserRepository } from '@/src/adapters/repositories/drizzle-user-repository';
import {
  FakeAuthGateway,
  FakeLogger,
  FakePaymentGateway,
  FakeRateLimiter,
} from '@/src/application/test-helpers/fakes';
import { GetAttemptedQuestionsUseCase } from '@/src/application/use-cases/get-attempted-questions';
import { GetNextQuestionUseCase } from '@/src/application/use-cases/get-next-question';
import { GetUserStatsUseCase } from '@/src/application/use-cases/get-user-stats';
import { SubmitAnswerUseCase } from '@/src/application/use-cases/submit-answer';

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
  userIds: string[];
  questionIds: string[];
  tagIds: string[];
  clerkEventIds: string[];
  deletedClerkUserIds: string[];
  stripeEventIds: string[];
};

const cleanup: CleanupState = {
  userIds: [],
  questionIds: [],
  tagIds: [],
  clerkEventIds: [],
  deletedClerkUserIds: [],
  stripeEventIds: [],
};

async function createUser(): Promise<{
  id: string;
  email: string;
  clerkUserId: string;
}> {
  const email = `it-${randomUUID()}@example.com`;
  const clerkUserId = `user_${randomUUID().replaceAll('-', '')}`;

  const [row] = await db
    .insert(schema.users)
    .values({ email, clerkUserId })
    .returning({
      id: schema.users.id,
      email: schema.users.email,
      clerkUserId: schema.users.clerkUserId,
    });

  if (!row) {
    throw new Error('Failed to insert user');
  }

  cleanup.userIds.push(row.id);
  return row;
}

function createAuthGateway(input: { id: string; email: string }) {
  return new FakeAuthGateway({
    id: input.id,
    email: input.email,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
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
  slug: string;
  status: schema.QuestionStatus;
  difficulty: schema.QuestionDifficulty;
  tagIds?: readonly string[];
}): Promise<{ id: string; correctChoiceId: string; wrongChoiceId: string }> {
  const createdAt = new Date();
  const updatedAt = createdAt;

  const [question] = await db
    .insert(schema.questions)
    .values({
      slug: input.slug,
      stemMd: '# Stem',
      explanationMd: '# Explanation',
      status: input.status,
      difficulty: input.difficulty,
      createdAt,
      updatedAt,
    })
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

  return {
    id: question.id,
    wrongChoiceId: choiceA.id,
    correctChoiceId: choiceB.id,
  };
}

afterEach(async () => {
  if (cleanup.clerkEventIds.length > 0) {
    await db
      .delete(schema.clerkEvents)
      .where(inArray(schema.clerkEvents.id, cleanup.clerkEventIds));
  }

  if (cleanup.deletedClerkUserIds.length > 0) {
    await db
      .delete(schema.deletedClerkUsers)
      .where(
        inArray(
          schema.deletedClerkUsers.clerkUserId,
          cleanup.deletedClerkUserIds,
        ),
      );
  }

  if (cleanup.stripeEventIds.length > 0) {
    await db
      .delete(schema.stripeEvents)
      .where(inArray(schema.stripeEvents.id, cleanup.stripeEventIds));
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
  cleanup.clerkEventIds.length = 0;
  cleanup.deletedClerkUserIds.length = 0;
  cleanup.stripeEventIds.length = 0;
});

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

describe('question controllers (integration)', () => {
  it('fetches a question and inserts an attempts row when submitting an answer', async () => {
    const user = await createUser();
    const tag = await createTag({
      slug: `it-tag-${randomUUID()}`,
      kind: 'topic',
    });
    const question = await createQuestion({
      slug: `it-q-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
      tagIds: [tag.id],
    });

    const authGateway = createAuthGateway(user);

    const questions = new DrizzleQuestionRepository(db);
    const attempts = new DrizzleAttemptRepository(db);
    const sessions = new DrizzlePracticeSessionRepository(db, () => new Date());
    const idempotencyKeyRepository = new DrizzleIdempotencyKeyRepository(
      db,
      () => new Date(),
    );
    const logger = new FakeLogger();

    const deps: QuestionControllerDeps = {
      authGateway,
      logger,
      rateLimiter: new FakeRateLimiter(),
      idempotencyKeyRepository,
      now: () => new Date(),
      checkEntitlementUseCase: { execute: async () => ({ isEntitled: true }) },
      getNextQuestionUseCase: new GetNextQuestionUseCase(
        questions,
        attempts,
        sessions,
        () => new Date(),
      ),
      submitAnswerUseCase: new SubmitAnswerUseCase(
        questions,
        attempts,
        sessions,
        logger,
      ),
    };

    const next = await getNextQuestion(
      { filters: { tagSlugs: [tag.slug], difficulties: [] } },
      deps,
    );

    expect(next).toMatchObject({
      ok: true,
      data: { questionId: question.id },
    });

    const result = await submitAnswer(
      { questionId: question.id, choiceId: question.correctChoiceId },
      deps,
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        isCorrect: true,
        correctChoiceId: question.correctChoiceId,
        explanationMd: '# Explanation',
      },
    });

    const inserted = await attempts.findByUserId(user.id, {
      limit: 10,
      offset: 0,
    });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      userId: user.id,
      questionId: question.id,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
    });
  });

  it('redacts isCorrect in submitAnswer responses for active exam sessions', async () => {
    const user = await createUser();
    const question = await createQuestion({
      slug: `it-submit-exam-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const authGateway = createAuthGateway(user);

    const questions = new DrizzleQuestionRepository(db);
    const attempts = new DrizzleAttemptRepository(db);
    const sessions = new DrizzlePracticeSessionRepository(db, () => new Date());
    const idempotencyKeyRepository = new DrizzleIdempotencyKeyRepository(
      db,
      () => new Date(),
    );
    const logger = new FakeLogger();

    const deps: QuestionControllerDeps = {
      authGateway,
      logger,
      rateLimiter: new FakeRateLimiter(),
      idempotencyKeyRepository,
      now: () => new Date(),
      checkEntitlementUseCase: { execute: async () => ({ isEntitled: true }) },
      getNextQuestionUseCase: new GetNextQuestionUseCase(
        questions,
        attempts,
        sessions,
        () => new Date(),
      ),
      submitAnswerUseCase: new SubmitAnswerUseCase(
        questions,
        attempts,
        sessions,
        logger,
        async (fn) =>
          db.transaction(async (tx) =>
            fn({
              attempts: new DrizzleAttemptRepository(tx),
              sessions: new DrizzlePracticeSessionRepository(
                tx,
                () => new Date(),
              ),
            }),
          ),
      ),
    };

    const session = await sessions.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });

    const result = await submitAnswer(
      {
        questionId: question.id,
        choiceId: question.correctChoiceId,
        sessionId: session.id,
      },
      deps,
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        isCorrect: null,
        correctChoiceId: null,
        explanationMd: null,
        referenceMd: null,
        choiceExplanations: [],
      },
    });
  });

  it('rolls back the attempt insert when recordQuestionAnswer fails inside a transaction', async () => {
    const user = await createUser();
    const question = await createQuestion({
      slug: `it-txn-rollback-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const questions = new DrizzleQuestionRepository(db);
    const attempts = new DrizzleAttemptRepository(db);
    const sessions = new DrizzlePracticeSessionRepository(db, () => new Date());
    const logger = new FakeLogger();

    const session = await sessions.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });

    // Transaction where attempt insert succeeds but recordQuestionAnswer throws
    const failingTransaction = async <T>(
      fn: (tx: {
        attempts: DrizzleAttemptRepository;
        sessions: DrizzlePracticeSessionRepository;
      }) => Promise<T>,
    ): Promise<T> =>
      db.transaction(async (tx) => {
        const txSessions = new DrizzlePracticeSessionRepository(
          tx,
          () => new Date(),
        );
        return fn({
          attempts: new DrizzleAttemptRepository(tx),
          sessions: {
            ...txSessions,
            recordQuestionAnswer: async () => {
              throw new Error('Simulated recordQuestionAnswer failure');
            },
          } as unknown as DrizzlePracticeSessionRepository,
        });
      });

    const useCase = new SubmitAnswerUseCase(
      questions,
      attempts,
      sessions,
      logger,
      failingTransaction,
    );

    await expect(
      useCase.execute({
        userId: user.id,
        questionId: question.id,
        choiceId: question.correctChoiceId,
        sessionId: session.id,
      }),
    ).rejects.toThrow('Simulated recordQuestionAnswer failure');

    // Gold-standard proof: no attempt row was committed despite the insert running
    const inserted = await attempts.findByUserId(user.id, {
      limit: 10,
      offset: 0,
    });
    const attemptsForQuestion = inserted.filter(
      (a) => a.questionId === question.id,
    );
    expect(attemptsForQuestion).toHaveLength(0);
  });
});

describe('stats controller (integration)', () => {
  it('aggregates totals, windows, streak, and recent activity from real DB', async () => {
    const user = await createUser();
    const slugA = `it-stats-a-${randomUUID()}`;
    const questionA = await createQuestion({
      slug: slugA,
      status: 'published',
      difficulty: 'easy',
    });
    const slugB = `it-stats-b-${randomUUID()}`;
    const questionB = await createQuestion({
      slug: slugB,
      status: 'published',
      difficulty: 'easy',
    });

    const now = new Date('2026-02-10T12:00:00.000Z');

    await db.insert(schema.attempts).values([
      {
        userId: user.id,
        questionId: questionA.id,
        practiceSessionId: null,
        selectedChoiceId: questionA.correctChoiceId,
        isCorrect: true,
        timeSpentSeconds: 10,
        answeredAt: new Date('2026-02-02T12:00:00.000Z'),
      },
      {
        userId: user.id,
        questionId: questionB.id,
        practiceSessionId: null,
        selectedChoiceId: questionB.wrongChoiceId,
        isCorrect: false,
        timeSpentSeconds: 10,
        answeredAt: new Date('2026-02-09T12:00:00.000Z'),
      },
      {
        userId: user.id,
        questionId: questionA.id,
        practiceSessionId: null,
        selectedChoiceId: questionA.correctChoiceId,
        isCorrect: true,
        timeSpentSeconds: 10,
        answeredAt: new Date('2026-02-10T11:00:00.000Z'),
      },
    ]);

    const authGateway = createAuthGateway(user);

    const result = await getUserStats(
      {},
      {
        authGateway,
        checkEntitlementUseCase: {
          execute: async () => ({ isEntitled: true }),
        },
        getUserStatsUseCase: new GetUserStatsUseCase(
          new DrizzleAttemptRepository(db),
          new DrizzleQuestionRepository(db),
          new FakeLogger(),
          () => now,
        ),
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.totalAnswered).toBe(3);
    expect(result.data.accuracyOverall).toBeCloseTo(2 / 3);
    expect(result.data.answeredLast7Days).toBe(2);
    expect(result.data.accuracyLast7Days).toBeCloseTo(1 / 2);
    expect(result.data.currentStreakDays).toBe(2);
    expect(result.data.recentActivity[0]).toMatchObject({
      isAvailable: true,
      slug: slugA,
      isCorrect: true,
    });
    const slugs = result.data.recentActivity.flatMap((row) =>
      row.isAvailable ? [row.slug] : [],
    );
    expect(slugs).toContain(slugB);
  });
});

describe('review controller (integration)', () => {
  it('lists attempted questions (incorrect) and marks unavailable ones when they are no longer published', async () => {
    const user = await createUser();
    const incorrectSlug = `it-incorrect-${randomUUID()}`;
    const incorrectQuestion = await createQuestion({
      slug: incorrectSlug,
      status: 'published',
      difficulty: 'easy',
    });
    const recoveredQuestion = await createQuestion({
      slug: `it-recovered-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const t1 = new Date('2026-02-01T00:00:00.000Z');
    const t2 = new Date('2026-02-02T00:00:00.000Z');
    const t3 = new Date('2026-02-03T00:00:00.000Z');
    const t4 = new Date('2026-02-04T00:00:00.000Z');

    await db.insert(schema.attempts).values([
      {
        userId: user.id,
        questionId: incorrectQuestion.id,
        practiceSessionId: null,
        selectedChoiceId: incorrectQuestion.correctChoiceId,
        isCorrect: true,
        timeSpentSeconds: 1,
        answeredAt: t1,
      },
      {
        userId: user.id,
        questionId: incorrectQuestion.id,
        practiceSessionId: null,
        selectedChoiceId: incorrectQuestion.wrongChoiceId,
        isCorrect: false,
        timeSpentSeconds: 1,
        answeredAt: t2,
      },
      {
        userId: user.id,
        questionId: recoveredQuestion.id,
        practiceSessionId: null,
        selectedChoiceId: recoveredQuestion.wrongChoiceId,
        isCorrect: false,
        timeSpentSeconds: 1,
        answeredAt: t3,
      },
      {
        userId: user.id,
        questionId: recoveredQuestion.id,
        practiceSessionId: null,
        selectedChoiceId: recoveredQuestion.correctChoiceId,
        isCorrect: true,
        timeSpentSeconds: 1,
        answeredAt: t4,
      },
    ]);

    const logger = new FakeLogger();

    const authGateway = createAuthGateway(user);

    const deps = {
      authGateway,
      checkEntitlementUseCase: {
        execute: async () => ({ isEntitled: true }),
      },
      getAttemptedQuestionsUseCase: new GetAttemptedQuestionsUseCase(
        new DrizzleAttemptRepository(db),
        new DrizzleQuestionRepository(db),
        logger,
      ),
    };

    const first = await getAttemptedQuestions(
      { limit: 10, offset: 0, result: 'incorrect' },
      deps,
    );

    expect(first.ok).toBe(true);
    if (!first.ok) return;

    expect(first.data.rows).toHaveLength(1);
    expect(first.data.rows[0]).toMatchObject({
      isAvailable: true,
      questionId: incorrectQuestion.id,
      isCorrect: false,
      sessionId: null,
      sessionMode: null,
      slug: incorrectSlug,
      stemMd: '# Stem',
      difficulty: 'easy',
      tagSlugs: [],
      lastAnsweredAt: t2.toISOString(),
    });
    expect(logger.warnCalls).toHaveLength(0);

    await db
      .update(schema.questions)
      .set({ status: 'draft' })
      .where(eq(schema.questions.id, incorrectQuestion.id));

    const second = await getAttemptedQuestions(
      { limit: 10, offset: 0, result: 'incorrect' },
      deps,
    );

    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.data.rows).toEqual([
      {
        isAvailable: false,
        questionId: incorrectQuestion.id,
        isCorrect: false,
        sessionId: null,
        sessionMode: null,
        lastAnsweredAt: t2.toISOString(),
      },
    ]);
    expect(logger.warnCalls).toEqual([
      {
        context: { questionId: incorrectQuestion.id },
        msg: 'Attempted question references missing question',
      },
    ]);
  });

  it('applies incorrect-first ordering before pagination across pages', async () => {
    const user = await createUser();
    const correctRecent = await createQuestion({
      slug: `it-correct-recent-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const incorrectRecent = await createQuestion({
      slug: `it-incorrect-recent-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const correctOld = await createQuestion({
      slug: `it-correct-old-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const incorrectOld = await createQuestion({
      slug: `it-incorrect-old-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    await db.insert(schema.attempts).values([
      {
        userId: user.id,
        questionId: correctRecent.id,
        practiceSessionId: null,
        selectedChoiceId: correctRecent.correctChoiceId,
        isCorrect: true,
        timeSpentSeconds: 1,
        answeredAt: new Date('2026-02-04T00:00:00.000Z'),
      },
      {
        userId: user.id,
        questionId: incorrectRecent.id,
        practiceSessionId: null,
        selectedChoiceId: incorrectRecent.wrongChoiceId,
        isCorrect: false,
        timeSpentSeconds: 1,
        answeredAt: new Date('2026-02-03T00:00:00.000Z'),
      },
      {
        userId: user.id,
        questionId: correctOld.id,
        practiceSessionId: null,
        selectedChoiceId: correctOld.correctChoiceId,
        isCorrect: true,
        timeSpentSeconds: 1,
        answeredAt: new Date('2026-02-02T00:00:00.000Z'),
      },
      {
        userId: user.id,
        questionId: incorrectOld.id,
        practiceSessionId: null,
        selectedChoiceId: incorrectOld.wrongChoiceId,
        isCorrect: false,
        timeSpentSeconds: 1,
        answeredAt: new Date('2026-02-01T00:00:00.000Z'),
      },
    ]);

    const authGateway = createAuthGateway(user);

    const deps = {
      authGateway,
      checkEntitlementUseCase: {
        execute: async () => ({ isEntitled: true }),
      },
      getAttemptedQuestionsUseCase: new GetAttemptedQuestionsUseCase(
        new DrizzleAttemptRepository(db),
        new DrizzleQuestionRepository(db),
        new FakeLogger(),
      ),
    };

    const firstPage = await getAttemptedQuestions(
      { limit: 2, offset: 0, sort: 'incorrect-first' },
      deps,
    );

    expect(firstPage.ok).toBe(true);
    if (!firstPage.ok) return;

    expect(firstPage.data.rows.map((row) => row.questionId)).toEqual([
      incorrectRecent.id,
      incorrectOld.id,
    ]);
    expect(firstPage.data.rows.every((row) => row.isCorrect === false)).toBe(
      true,
    );

    const secondPage = await getAttemptedQuestions(
      { limit: 2, offset: 2, sort: 'incorrect-first' },
      deps,
    );

    expect(secondPage.ok).toBe(true);
    if (!secondPage.ok) return;

    expect(secondPage.data.rows.map((row) => row.questionId)).toEqual([
      correctRecent.id,
      correctOld.id,
    ]);
    expect(secondPage.data.rows.every((row) => row.isCorrect === true)).toBe(
      true,
    );
  });
});

describe('stripe webhook controller (integration)', () => {
  it('persists subscription updates and marks the Stripe event as processed', async () => {
    const user = await createUser();
    const eventId = `evt_${randomUUID().replaceAll('-', '')}`;
    cleanup.stripeEventIds.push(eventId);

    const subscriptionUpdate = {
      userId: user.id,
      externalCustomerId: `cus_${randomUUID().replaceAll('-', '')}`,
      externalSubscriptionId: `sub_${randomUUID().replaceAll('-', '')}`,
      plan: 'monthly' as const,
      status: 'active' as const,
      currentPeriodEnd: new Date('2026-03-01T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
    };

    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_unused',
      checkoutUrl: 'https://stripe.test/checkout',
      portalUrl: 'https://stripe.test/portal',
      webhookResult: {
        eventId,
        type: 'customer.subscription.updated',
        subscriptionUpdate,
      },
    });

    const priceIds = {
      monthly: 'price_test_monthly',
      annual: 'price_test_annual',
    };

    const input: StripeWebhookInput = { rawBody: 'raw', signature: 'sig_1' };

    await processStripeWebhook(
      {
        paymentGateway,
        logger: new FakeLogger(),
        now: () => new Date(),
        transaction: async (fn) =>
          db.transaction(async (tx) =>
            fn({
              stripeEvents: new DrizzleStripeEventRepository(tx),
              subscriptions: new DrizzleSubscriptionRepository(tx, priceIds),
              stripeCustomers: new DrizzleStripeCustomerRepository(tx),
            }),
          ),
      },
      input,
    );

    const stripeCustomers = new DrizzleStripeCustomerRepository(db);
    await expect(stripeCustomers.findByUserId(user.id)).resolves.toEqual({
      stripeCustomerId: subscriptionUpdate.externalCustomerId,
    });

    const subscriptions = new DrizzleSubscriptionRepository(db, priceIds);
    const subscription = await subscriptions.findByUserId(user.id);
    expect(subscription).toMatchObject({
      userId: user.id,
      plan: 'monthly',
      status: 'active',
      cancelAtPeriodEnd: false,
    });
    expect(subscription?.currentPeriodEnd.toISOString()).toBe(
      subscriptionUpdate.currentPeriodEnd.toISOString(),
    );

    const event = await db.query.stripeEvents.findFirst({
      where: eq(schema.stripeEvents.id, eventId),
    });
    expect(event).toMatchObject({
      id: eventId,
      type: 'customer.subscription.updated',
      error: null,
    });
    expect(event?.processedAt).toBeInstanceOf(Date);
  });
});

describe('clerk webhook controller (integration)', () => {
  it('deletes the user and cascades stripe data on user.deleted', async () => {
    const user = await createUser();
    const stripeCustomerId = `cus_${randomUUID().replaceAll('-', '')}`;
    const eventId = `evt_${randomUUID().replaceAll('-', '')}`;

    await db.insert(schema.stripeCustomers).values({
      userId: user.id,
      stripeCustomerId,
    });

    await db.insert(schema.stripeSubscriptions).values({
      userId: user.id,
      stripeSubscriptionId: `sub_${randomUUID().replaceAll('-', '')}`,
      status: 'active',
      priceId: 'price_test_monthly',
      currentPeriodEnd: new Date('2026-03-01T00:00:00.000Z'),
    });

    const cancelStripeCustomerSubscriptions = vi.fn(async () => undefined);
    const userRepository = new DrizzleUserRepository(db);
    const clerkEventRepository = new DrizzleClerkEventRepository(db);
    const deletedClerkUserRepository = new DrizzleDeletedClerkUserRepository(
      db,
    );
    const stripeCustomerRepository = new DrizzleStripeCustomerRepository(db);

    const deps = {
      transaction: async <T>(
        fn: (tx: {
          clerkEvents: DrizzleClerkEventRepository;
          deletedClerkUsers: DrizzleDeletedClerkUserRepository;
          userRepository: DrizzleUserRepository;
          stripeCustomerRepository: DrizzleStripeCustomerRepository;
        }) => Promise<T>,
      ) =>
        db.transaction(async (tx) =>
          fn({
            clerkEvents: new DrizzleClerkEventRepository(tx),
            deletedClerkUsers: new DrizzleDeletedClerkUserRepository(tx),
            userRepository: new DrizzleUserRepository(tx),
            stripeCustomerRepository: new DrizzleStripeCustomerRepository(tx),
          }),
        ),
      cancelStripeCustomerSubscriptions,
      logger: new FakeLogger(),
    };

    const event: ClerkWebhookEvent = {
      eventId,
      type: 'user.deleted',
      data: { id: user.clerkUserId },
    };

    cleanup.clerkEventIds.push(eventId);
    cleanup.deletedClerkUserIds.push(user.clerkUserId);
    await processClerkWebhook(deps, event);

    expect(cancelStripeCustomerSubscriptions).toHaveBeenCalledTimes(1);
    expect(cancelStripeCustomerSubscriptions).toHaveBeenCalledWith(
      stripeCustomerId,
    );

    await expect(
      userRepository.findByClerkId(user.clerkUserId),
    ).resolves.toBeNull();
    await expect(
      deletedClerkUserRepository.exists(user.clerkUserId),
    ).resolves.toBe(true);
    await expect(clerkEventRepository.peek(eventId)).resolves.toMatchObject({
      processedAt: expect.any(Date),
      error: null,
    });
    await expect(
      stripeCustomerRepository.findByUserId(user.id),
    ).resolves.toBeNull();
    await expect(
      db.query.stripeSubscriptions.findFirst({
        where: eq(schema.stripeSubscriptions.userId, user.id),
      }),
    ).resolves.toBeUndefined();
  });

  it('ignores replayed user.updated deliveries after user.deleted', async () => {
    const clerkUserId = `user_${randomUUID().replaceAll('-', '')}`;
    const updatedEventId = `evt_${randomUUID().replaceAll('-', '')}`;
    const deletedEventId = `evt_${randomUUID().replaceAll('-', '')}`;

    cleanup.clerkEventIds.push(updatedEventId, deletedEventId);
    cleanup.deletedClerkUserIds.push(clerkUserId);

    const userRepository = new DrizzleUserRepository(db);
    const deletedClerkUserRepository = new DrizzleDeletedClerkUserRepository(
      db,
    );

    const deps = {
      transaction: async <T>(
        fn: (tx: {
          clerkEvents: DrizzleClerkEventRepository;
          deletedClerkUsers: DrizzleDeletedClerkUserRepository;
          userRepository: DrizzleUserRepository;
          stripeCustomerRepository: DrizzleStripeCustomerRepository;
        }) => Promise<T>,
      ) =>
        db.transaction(async (tx) =>
          fn({
            clerkEvents: new DrizzleClerkEventRepository(tx),
            deletedClerkUsers: new DrizzleDeletedClerkUserRepository(tx),
            userRepository: new DrizzleUserRepository(tx),
            stripeCustomerRepository: new DrizzleStripeCustomerRepository(tx),
          }),
        ),
      cancelStripeCustomerSubscriptions: vi.fn(async () => undefined),
      logger: new FakeLogger(),
    };

    const updatedEvent: ClerkWebhookEvent = {
      eventId: updatedEventId,
      type: 'user.updated',
      data: {
        id: clerkUserId,
        primary_email_address_id: 'email_1',
        updated_at: 1769904000000,
        email_addresses: [
          { id: 'email_1', email_address: `it-${randomUUID()}@example.com` },
        ],
      },
    };

    await processClerkWebhook(deps, updatedEvent);

    const createdUser = await userRepository.findByClerkId(clerkUserId);
    expect(createdUser).toMatchObject({ email: expect.stringContaining('@') });
    if (createdUser) {
      cleanup.userIds.push(createdUser.id);
    }

    await processClerkWebhook(deps, {
      eventId: deletedEventId,
      type: 'user.deleted',
      data: { id: clerkUserId },
    });

    await processClerkWebhook(deps, updatedEvent);

    await expect(userRepository.findByClerkId(clerkUserId)).resolves.toBeNull();
    await expect(deletedClerkUserRepository.exists(clerkUserId)).resolves.toBe(
      true,
    );
  });
});
