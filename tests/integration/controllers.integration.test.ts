import 'dotenv/config';
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
import { getMissedQuestions } from '@/src/adapters/controllers/review-controller';
import { getUserStats } from '@/src/adapters/controllers/stats-controller';
import type { StripeWebhookInput } from '@/src/adapters/controllers/stripe-webhook-controller';
import { processStripeWebhook } from '@/src/adapters/controllers/stripe-webhook-controller';
import { DrizzleAttemptRepository } from '@/src/adapters/repositories/drizzle-attempt-repository';
import { DrizzleIdempotencyKeyRepository } from '@/src/adapters/repositories/drizzle-idempotency-key-repository';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import { DrizzleQuestionRepository } from '@/src/adapters/repositories/drizzle-question-repository';
import { DrizzleStripeCustomerRepository } from '@/src/adapters/repositories/drizzle-stripe-customer-repository';
import { DrizzleStripeEventRepository } from '@/src/adapters/repositories/drizzle-stripe-event-repository';
import { DrizzleSubscriptionRepository } from '@/src/adapters/repositories/drizzle-subscription-repository';
import { DrizzleUserRepository } from '@/src/adapters/repositories/drizzle-user-repository';
import type { AuthGateway } from '@/src/application/ports/gateways';
import {
  FakeLogger,
  FakePaymentGateway,
} from '@/src/application/test-helpers/fakes';
import { GetMissedQuestionsUseCase } from '@/src/application/use-cases/get-missed-questions';
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
  stripeEventIds: string[];
};

const cleanup: CleanupState = {
  userIds: [],
  questionIds: [],
  tagIds: [],
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

    const authGateway: AuthGateway = {
      getCurrentUser: async () => ({
        id: user.id,
        email: user.email,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      requireUser: async () => ({
        id: user.id,
        email: user.email,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    };

    const questions = new DrizzleQuestionRepository(db);
    const attempts = new DrizzleAttemptRepository(db);
    const sessions = new DrizzlePracticeSessionRepository(db, () => new Date());
    const idempotencyKeyRepository = new DrizzleIdempotencyKeyRepository(
      db,
      () => new Date(),
    );

    const deps: QuestionControllerDeps = {
      authGateway,
      rateLimiter: {
        limit: async () => ({
          success: true,
          limit: 120,
          remaining: 119,
          retryAfterSeconds: 0,
        }),
      },
      idempotencyKeyRepository,
      checkEntitlementUseCase: { execute: async () => ({ isEntitled: true }) },
      getNextQuestionUseCase: new GetNextQuestionUseCase(
        questions,
        attempts,
        sessions,
      ),
      submitAnswerUseCase: new SubmitAnswerUseCase(
        questions,
        attempts,
        sessions,
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

    const authGateway: AuthGateway = {
      getCurrentUser: async () => ({
        id: user.id,
        email: user.email,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      requireUser: async () => ({
        id: user.id,
        email: user.email,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    };

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
  it('lists missed questions and marks unavailable ones when they are no longer published', async () => {
    const user = await createUser();
    const missedSlug = `it-missed-${randomUUID()}`;
    const missedQuestion = await createQuestion({
      slug: missedSlug,
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
        questionId: missedQuestion.id,
        practiceSessionId: null,
        selectedChoiceId: missedQuestion.correctChoiceId,
        isCorrect: true,
        timeSpentSeconds: 1,
        answeredAt: t1,
      },
      {
        userId: user.id,
        questionId: missedQuestion.id,
        practiceSessionId: null,
        selectedChoiceId: missedQuestion.wrongChoiceId,
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

    const authGateway: AuthGateway = {
      getCurrentUser: async () => ({
        id: user.id,
        email: user.email,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      requireUser: async () => ({
        id: user.id,
        email: user.email,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    };

    const deps = {
      authGateway,
      checkEntitlementUseCase: {
        execute: async () => ({ isEntitled: true }),
      },
      getMissedQuestionsUseCase: new GetMissedQuestionsUseCase(
        new DrizzleAttemptRepository(db),
        new DrizzleQuestionRepository(db),
        logger,
      ),
    };

    const first = await getMissedQuestions({ limit: 10, offset: 0 }, deps);

    expect(first.ok).toBe(true);
    if (!first.ok) return;

    expect(first.data.rows).toHaveLength(1);
    expect(first.data.rows[0]).toMatchObject({
      isAvailable: true,
      questionId: missedQuestion.id,
      slug: missedSlug,
      stemMd: '# Stem',
      difficulty: 'easy',
      lastAnsweredAt: t2.toISOString(),
    });
    expect(logger.warnCalls).toHaveLength(0);

    await db
      .update(schema.questions)
      .set({ status: 'draft' })
      .where(eq(schema.questions.id, missedQuestion.id));

    const second = await getMissedQuestions({ limit: 10, offset: 0 }, deps);

    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.data.rows).toEqual([
      {
        isAvailable: false,
        questionId: missedQuestion.id,
        lastAnsweredAt: t2.toISOString(),
      },
    ]);
    expect(logger.warnCalls).toEqual([
      {
        context: { questionId: missedQuestion.id },
        msg: 'Missed question references missing question',
      },
    ]);
  });
});

describe('stripe webhook controller (integration)', () => {
  it('persists subscription updates and marks the Stripe event as processed', async () => {
    const user = await createUser();
    const eventId = `evt_${randomUUID().replaceAll('-', '')}`;
    cleanup.stripeEventIds.push(eventId);

    const subscriptionUpdate = {
      userId: user.id,
      stripeCustomerId: `cus_${randomUUID().replaceAll('-', '')}`,
      stripeSubscriptionId: `sub_${randomUUID().replaceAll('-', '')}`,
      plan: 'monthly' as const,
      status: 'active' as const,
      currentPeriodEnd: new Date('2026-03-01T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
    };

    const paymentGateway = new FakePaymentGateway({
      stripeCustomerId: 'cus_unused',
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
      stripeCustomerId: subscriptionUpdate.stripeCustomerId,
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

    const deps = {
      userRepository: new DrizzleUserRepository(db),
      stripeCustomerRepository: new DrizzleStripeCustomerRepository(db),
      cancelStripeCustomerSubscriptions,
      logger: new FakeLogger(),
    };

    const event: ClerkWebhookEvent = {
      type: 'user.deleted',
      data: { id: user.clerkUserId },
    };

    await processClerkWebhook(deps, event);

    expect(cancelStripeCustomerSubscriptions).toHaveBeenCalledTimes(1);
    expect(cancelStripeCustomerSubscriptions).toHaveBeenCalledWith(
      stripeCustomerId,
    );

    await expect(
      deps.userRepository.findByClerkId(user.clerkUserId),
    ).resolves.toBeNull();
    await expect(
      deps.stripeCustomerRepository.findByUserId(user.id),
    ).resolves.toBeNull();
    await expect(
      db.query.stripeSubscriptions.findFirst({
        where: eq(schema.stripeSubscriptions.userId, user.id),
      }),
    ).resolves.toBeUndefined();
  });
});
