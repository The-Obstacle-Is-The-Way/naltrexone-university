import type { BillingControllerDeps } from '@/src/adapters/controllers/billing-controller';
import type { BookmarkControllerDeps } from '@/src/adapters/controllers/bookmark-controller';
import type { PracticeControllerDeps } from '@/src/adapters/controllers/practice-controller';
import type { QuestionControllerDeps } from '@/src/adapters/controllers/question-controller';
import type { QuestionViewControllerDeps } from '@/src/adapters/controllers/question-view-controller';
import type { ReviewControllerDeps } from '@/src/adapters/controllers/review-controller';
import type { StatsControllerDeps } from '@/src/adapters/controllers/stats-controller';
import type { StripeWebhookDeps } from '@/src/adapters/controllers/stripe-webhook-controller';
import type { TagControllerDeps } from '@/src/adapters/controllers/tag-controller';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';
import type {
  AuthGateway,
  PaymentGateway,
  RateLimiter,
} from '@/src/application/ports/gateways';
import type {
  AttemptRepository,
  BookmarkRepository,
  IdempotencyKeyRepository,
  PracticeSessionRepository,
  QuestionRepository,
  StripeCustomerRepository,
  StripeEventRepository,
  SubscriptionRepository,
  TagRepository,
  UserRepository,
} from '@/src/application/ports/repositories';
import type {
  CheckEntitlementUseCase,
  CreateCheckoutSessionUseCase,
  CreatePortalSessionUseCase,
  EndPracticeSessionUseCase,
  GetBookmarksUseCase,
  GetIncompletePracticeSessionUseCase,
  GetMissedQuestionsUseCase,
  GetNextQuestionUseCase,
  GetPracticeSessionReviewUseCase,
  GetSessionHistoryUseCase,
  GetUserStatsUseCase,
  SetPracticeSessionQuestionMarkUseCase,
  StartPracticeSessionUseCase,
  SubmitAnswerUseCase,
  ToggleBookmarkUseCase,
} from '@/src/application/use-cases';
import type { env } from '../env';
import type { logger } from '../logger';
import type { stripe } from '../stripe';

export type ContainerPrimitives = {
  db: DrizzleDb;
  env: typeof env;
  logger: typeof logger;
  stripe: typeof stripe;
  now: () => Date;
};

export type StripePriceIds = {
  monthly: string;
  annual: string;
};

export type RepositoryFactories = {
  createAttemptRepository: (dbOverride?: DrizzleDb) => AttemptRepository;
  createBookmarkRepository: (dbOverride?: DrizzleDb) => BookmarkRepository;
  createIdempotencyKeyRepository: (
    dbOverride?: DrizzleDb,
  ) => IdempotencyKeyRepository;
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
  createRateLimiter: () => RateLimiter;
};

export type UseCaseFactories = {
  createCheckEntitlementUseCase: () => CheckEntitlementUseCase;
  createCheckoutSessionUseCase: () => CreateCheckoutSessionUseCase;
  createPortalSessionUseCase: () => CreatePortalSessionUseCase;
  createEndPracticeSessionUseCase: () => EndPracticeSessionUseCase;
  createGetNextQuestionUseCase: () => GetNextQuestionUseCase;
  createGetBookmarksUseCase: () => GetBookmarksUseCase;
  createGetIncompletePracticeSessionUseCase: () => GetIncompletePracticeSessionUseCase;
  createGetMissedQuestionsUseCase: () => GetMissedQuestionsUseCase;
  createGetPracticeSessionReviewUseCase: () => GetPracticeSessionReviewUseCase;
  createGetSessionHistoryUseCase: () => GetSessionHistoryUseCase;
  createGetUserStatsUseCase: () => GetUserStatsUseCase;
  createSetPracticeSessionQuestionMarkUseCase: () => SetPracticeSessionQuestionMarkUseCase;
  createStartPracticeSessionUseCase: () => StartPracticeSessionUseCase;
  createSubmitAnswerUseCase: () => SubmitAnswerUseCase;
  createToggleBookmarkUseCase: () => ToggleBookmarkUseCase;
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
