import 'server-only';
import { currentUser } from '@clerk/nextjs/server';
import type { BillingControllerDeps } from '@/src/adapters/controllers/billing-controller';
import type { BookmarkControllerDeps } from '@/src/adapters/controllers/bookmark-controller';
import type { PracticeControllerDeps } from '@/src/adapters/controllers/practice-controller';
import type { QuestionControllerDeps } from '@/src/adapters/controllers/question-controller';
import type { QuestionViewControllerDeps } from '@/src/adapters/controllers/question-view-controller';
import type { ReviewControllerDeps } from '@/src/adapters/controllers/review-controller';
import type { StatsControllerDeps } from '@/src/adapters/controllers/stats-controller';
import type { StripeWebhookDeps } from '@/src/adapters/controllers/stripe-webhook-controller';
import type { TagControllerDeps } from '@/src/adapters/controllers/tag-controller';
import {
  ClerkAuthGateway,
  StripePaymentGateway,
} from '@/src/adapters/gateways';
import {
  DrizzleAttemptRepository,
  DrizzleBookmarkRepository,
  DrizzlePracticeSessionRepository,
  DrizzleQuestionRepository,
  DrizzleStripeCustomerRepository,
  DrizzleStripeEventRepository,
  DrizzleSubscriptionRepository,
  DrizzleTagRepository,
  DrizzleUserRepository,
} from '@/src/adapters/repositories';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';
import type {
  AuthGateway,
  PaymentGateway,
} from '@/src/application/ports/gateways';
import type {
  AttemptRepository,
  BookmarkRepository,
  PracticeSessionRepository,
  QuestionRepository,
  StripeCustomerRepository,
  StripeEventRepository,
  SubscriptionRepository,
  TagRepository,
  UserRepository,
} from '@/src/application/ports/repositories';
import {
  CheckEntitlementUseCase,
  GetNextQuestionUseCase,
  SubmitAnswerUseCase,
} from '@/src/application/use-cases';
import { db } from './db';
import { env } from './env';
import { logger } from './logger';
import { stripe } from './stripe';

export type ContainerPrimitives = {
  db: DrizzleDb;
  env: typeof env;
  logger: typeof logger;
  stripe: typeof stripe;
  now: () => Date;
};

export type RepositoryFactories = {
  createAttemptRepository: (dbOverride?: DrizzleDb) => AttemptRepository;
  createBookmarkRepository: (dbOverride?: DrizzleDb) => BookmarkRepository;
  createPracticeSessionRepository: (
    dbOverride?: DrizzleDb,
  ) => PracticeSessionRepository;
  createQuestionRepository: (dbOverride?: DrizzleDb) => QuestionRepository;
  createTagRepository: (dbOverride?: DrizzleDb) => TagRepository;
  createSubscriptionRepository: (
    dbOverride?: DrizzleDb,
  ) => SubscriptionRepository;
  createStripeCustomerRepository: (
    dbOverride?: DrizzleDb,
  ) => StripeCustomerRepository;
  createStripeEventRepository: (
    dbOverride?: DrizzleDb,
  ) => StripeEventRepository;
  createUserRepository: (dbOverride?: DrizzleDb) => UserRepository;
};

export type GatewayFactories = {
  createAuthGateway: () => AuthGateway;
  createPaymentGateway: () => PaymentGateway;
};

export type UseCaseFactories = {
  createCheckEntitlementUseCase: () => CheckEntitlementUseCase;
  createGetNextQuestionUseCase: () => GetNextQuestionUseCase;
  createSubmitAnswerUseCase: () => SubmitAnswerUseCase;
};

export type ControllerFactories = {
  createStripeWebhookDeps: () => StripeWebhookDeps;
  createQuestionControllerDeps: () => QuestionControllerDeps;
  createQuestionViewControllerDeps: () => QuestionViewControllerDeps;
  createBillingControllerDeps: () => BillingControllerDeps;
  createBookmarkControllerDeps: () => BookmarkControllerDeps;
  createPracticeControllerDeps: () => PracticeControllerDeps;
  createReviewControllerDeps: () => ReviewControllerDeps;
  createStatsControllerDeps: () => StatsControllerDeps;
  createTagControllerDeps: () => TagControllerDeps;
};

export type ContainerOverrides = {
  primitives?: Partial<ContainerPrimitives>;
  repositories?: Partial<RepositoryFactories>;
  gateways?: Partial<GatewayFactories>;
  useCases?: Partial<UseCaseFactories>;
  controllers?: Partial<ControllerFactories>;
};

/**
 * Composition root primitives.
 *
 * As we build out `src/application/**` and `src/adapters/**`, this file will grow
 * factory functions that wire ports -> concrete implementations.
 */
export function createContainerPrimitives(
  overrides: Partial<ContainerPrimitives> = {},
) {
  return {
    db,
    env,
    logger,
    stripe,
    now: () => new Date(),
    ...overrides,
  } as const;
}

export function createContainer(overrides: ContainerOverrides = {}) {
  const primitives = createContainerPrimitives(overrides.primitives);

  const stripePriceIds = {
    monthly: primitives.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY,
    annual: primitives.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL,
  };

  const repositoryFactories: RepositoryFactories = {
    createAttemptRepository: (dbOverride = primitives.db) =>
      new DrizzleAttemptRepository(dbOverride),
    createBookmarkRepository: (dbOverride = primitives.db) =>
      new DrizzleBookmarkRepository(dbOverride),
    createPracticeSessionRepository: (dbOverride = primitives.db) =>
      new DrizzlePracticeSessionRepository(dbOverride, primitives.now),
    createQuestionRepository: (dbOverride = primitives.db) =>
      new DrizzleQuestionRepository(dbOverride),
    createTagRepository: (dbOverride = primitives.db) =>
      new DrizzleTagRepository(dbOverride),
    createSubscriptionRepository: (dbOverride = primitives.db) =>
      new DrizzleSubscriptionRepository(
        dbOverride,
        stripePriceIds,
        primitives.now,
      ),
    createStripeCustomerRepository: (dbOverride = primitives.db) =>
      new DrizzleStripeCustomerRepository(dbOverride),
    createStripeEventRepository: (dbOverride = primitives.db) =>
      new DrizzleStripeEventRepository(dbOverride, primitives.now),
    createUserRepository: (dbOverride = primitives.db) =>
      new DrizzleUserRepository(dbOverride, primitives.now),
  };

  const repositories = {
    ...repositoryFactories,
    ...overrides.repositories,
  } satisfies RepositoryFactories;

  const gatewayFactories: GatewayFactories = {
    createAuthGateway: () =>
      new ClerkAuthGateway({
        userRepository: repositories.createUserRepository(),
        getClerkUser: currentUser,
      }),
    createPaymentGateway: () =>
      new StripePaymentGateway({
        stripe: primitives.stripe,
        webhookSecret: primitives.env.STRIPE_WEBHOOK_SECRET,
        priceIds: stripePriceIds,
        logger: primitives.logger,
      }),
  };

  const gateways = {
    ...gatewayFactories,
    ...overrides.gateways,
  } satisfies GatewayFactories;

  const useCaseFactories: UseCaseFactories = {
    createCheckEntitlementUseCase: () =>
      new CheckEntitlementUseCase(
        repositories.createSubscriptionRepository(),
        primitives.now,
      ),
    createGetNextQuestionUseCase: () =>
      new GetNextQuestionUseCase(
        repositories.createQuestionRepository(),
        repositories.createAttemptRepository(),
        repositories.createPracticeSessionRepository(),
      ),
    createSubmitAnswerUseCase: () =>
      new SubmitAnswerUseCase(
        repositories.createQuestionRepository(),
        repositories.createAttemptRepository(),
        repositories.createPracticeSessionRepository(),
      ),
  };

  const useCases = {
    ...useCaseFactories,
    ...overrides.useCases,
  } satisfies UseCaseFactories;

  const controllerFactories: ControllerFactories = {
    createStripeWebhookDeps: () => ({
      paymentGateway: gateways.createPaymentGateway(),
      transaction: async (fn) =>
        primitives.db.transaction(async (tx) =>
          fn({
            stripeEvents: repositories.createStripeEventRepository(tx),
            subscriptions: repositories.createSubscriptionRepository(tx),
            stripeCustomers: repositories.createStripeCustomerRepository(tx),
          }),
        ),
    }),
    createQuestionControllerDeps: () => ({
      authGateway: gateways.createAuthGateway(),
      checkEntitlementUseCase: useCases.createCheckEntitlementUseCase(),
      getNextQuestionUseCase: useCases.createGetNextQuestionUseCase(),
      submitAnswerUseCase: useCases.createSubmitAnswerUseCase(),
    }),
    createQuestionViewControllerDeps: () => ({
      authGateway: gateways.createAuthGateway(),
      checkEntitlementUseCase: useCases.createCheckEntitlementUseCase(),
      questionRepository: repositories.createQuestionRepository(),
    }),
    createBillingControllerDeps: () => ({
      authGateway: gateways.createAuthGateway(),
      stripeCustomerRepository: repositories.createStripeCustomerRepository(),
      paymentGateway: gateways.createPaymentGateway(),
      getClerkUserId: async () => (await currentUser())?.id ?? null,
      appUrl: primitives.env.NEXT_PUBLIC_APP_URL,
    }),
    createBookmarkControllerDeps: () => ({
      authGateway: gateways.createAuthGateway(),
      checkEntitlementUseCase: useCases.createCheckEntitlementUseCase(),
      bookmarkRepository: repositories.createBookmarkRepository(),
      questionRepository: repositories.createQuestionRepository(),
      logger: primitives.logger,
    }),
    createPracticeControllerDeps: () => ({
      authGateway: gateways.createAuthGateway(),
      checkEntitlementUseCase: useCases.createCheckEntitlementUseCase(),
      questionRepository: repositories.createQuestionRepository(),
      practiceSessionRepository: repositories.createPracticeSessionRepository(),
      attemptRepository: repositories.createAttemptRepository(),
      now: primitives.now,
    }),
    createReviewControllerDeps: () => ({
      authGateway: gateways.createAuthGateway(),
      checkEntitlementUseCase: useCases.createCheckEntitlementUseCase(),
      attemptRepository: repositories.createAttemptRepository(),
      questionRepository: repositories.createQuestionRepository(),
      logger: primitives.logger,
    }),
    createStatsControllerDeps: () => ({
      authGateway: gateways.createAuthGateway(),
      checkEntitlementUseCase: useCases.createCheckEntitlementUseCase(),
      attemptRepository: repositories.createAttemptRepository(),
      questionRepository: repositories.createQuestionRepository(),
      now: primitives.now,
      logger: primitives.logger,
    }),
    createTagControllerDeps: () => ({
      authGateway: gateways.createAuthGateway(),
      checkEntitlementUseCase: useCases.createCheckEntitlementUseCase(),
      tagRepository: repositories.createTagRepository(),
      logger: primitives.logger,
    }),
  };

  const controllers = {
    ...controllerFactories,
    ...overrides.controllers,
  } satisfies ControllerFactories;

  return {
    ...primitives,
    primitives,
    ...repositories,
    ...gateways,
    ...useCases,
    ...controllers,
  } as const;
}
