import type { BillingControllerDeps } from '@/src/adapters/controllers/billing-controller';
import type { BookmarkControllerDeps } from '@/src/adapters/controllers/bookmark-controller';
import type { PracticeControllerDeps } from '@/src/adapters/controllers/practice-controller';
import type { QuestionControllerDeps } from '@/src/adapters/controllers/question-controller';
import type { QuestionFeedbackControllerDeps } from '@/src/adapters/controllers/question-feedback-controller';
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
  ClerkEventRepository,
  DeletedClerkUserRepository,
  IdempotencyKeyRepository,
  PendingStripeCancellationRepository,
  PracticeSessionRepository,
  QuestionFeedbackRepository,
  QuestionRepository,
  StripeCustomerRepository,
  StripeEventRepository,
  SubscriptionRepository,
  TagRepository,
  UserRepository,
} from '@/src/application/ports/repositories';
import type {
  CheckEntitlementUseCase,
  CountAvailableQuestionsUseCase,
  CreateCheckoutSessionUseCase,
  CreatePortalSessionUseCase,
  EndPracticeSessionUseCase,
  FinalizeExamAnswersUseCase,
  GetAttemptedQuestionsUseCase,
  GetBookmarksUseCase,
  GetCompletedSessionQuestionsWithFeedbackUseCase,
  GetIncompletePracticeSessionUseCase,
  GetNextQuestionUseCase,
  GetPracticeSessionReviewUseCase,
  GetPracticeSessionSummaryUseCase,
  GetPreviousAttemptUseCase,
  GetQuestionRatingUseCase,
  GetSessionHistoryUseCase,
  GetUserStatsUseCase,
  RateQuestionUseCase,
  SaveExamDraftAnswerUseCase,
  SetPracticeSessionQuestionMarkUseCase,
  StartPracticeSessionUseCase,
  SubmitAnswerUseCase,
  SubmitQuestionReportUseCase,
  ToggleBookmarkUseCase,
} from '@/src/application/use-cases';
import type { env } from '../env';
import type { logger } from '../logger';
import type { getStripe } from '../stripe';

export type ContainerPrimitives = {
  db: DrizzleDb;
  env: typeof env;
  logger: typeof logger;
  getStripe: typeof getStripe;
  now: () => Date;
};

export type StripePriceIds = {
  monthly: string;
  annual: string;
};

export type RepositoryFactories = {
  createAttemptRepository: (dbOverride?: DrizzleDb) => AttemptRepository;
  createBookmarkRepository: (dbOverride?: DrizzleDb) => BookmarkRepository;
  createClerkEventRepository: (dbOverride?: DrizzleDb) => ClerkEventRepository;
  createDeletedClerkUserRepository: (
    dbOverride?: DrizzleDb,
  ) => DeletedClerkUserRepository;
  createIdempotencyKeyRepository: (
    dbOverride?: DrizzleDb,
  ) => IdempotencyKeyRepository;
  createPendingStripeCancellationRepository: (
    dbOverride?: DrizzleDb,
  ) => PendingStripeCancellationRepository;
  createPracticeSessionRepository: (
    dbOverride?: DrizzleDb,
  ) => PracticeSessionRepository;
  createQuestionFeedbackRepository: (
    dbOverride?: DrizzleDb,
  ) => QuestionFeedbackRepository;
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
  createCountAvailableQuestionsUseCase: () => CountAvailableQuestionsUseCase;
  createEndPracticeSessionUseCase: () => EndPracticeSessionUseCase;
  createFinalizeExamAnswersUseCase: () => FinalizeExamAnswersUseCase;
  createSaveExamDraftAnswerUseCase: () => SaveExamDraftAnswerUseCase;
  createGetNextQuestionUseCase: () => GetNextQuestionUseCase;
  createGetPreviousAttemptUseCase: () => GetPreviousAttemptUseCase;
  createGetQuestionRatingUseCase: () => GetQuestionRatingUseCase;
  createRateQuestionUseCase: () => RateQuestionUseCase;
  createSubmitQuestionReportUseCase: () => SubmitQuestionReportUseCase;
  createGetBookmarksUseCase: () => GetBookmarksUseCase;
  createGetAttemptedQuestionsUseCase: () => GetAttemptedQuestionsUseCase;
  createGetIncompletePracticeSessionUseCase: () => GetIncompletePracticeSessionUseCase;
  createGetCompletedSessionQuestionsWithFeedbackUseCase: () => GetCompletedSessionQuestionsWithFeedbackUseCase;
  createGetPracticeSessionReviewUseCase: () => GetPracticeSessionReviewUseCase;
  createGetPracticeSessionSummaryUseCase: () => GetPracticeSessionSummaryUseCase;
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
  createQuestionFeedbackControllerDeps: () => QuestionFeedbackControllerDeps;
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
