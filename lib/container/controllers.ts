import type { ClerkUserLike } from '@/src/adapters/gateways';
import type {
  ContainerPrimitives,
  ControllerFactories,
  GatewayFactories,
  RepositoryFactories,
  UseCaseFactories,
} from './types';

export function createControllerFactories(input: {
  primitives: ContainerPrimitives;
  repositories: RepositoryFactories;
  gateways: GatewayFactories;
  useCases: UseCaseFactories;
  getClerkUser: () => Promise<ClerkUserLike | null>;
}): ControllerFactories {
  const { primitives, repositories, gateways, useCases, getClerkUser } = input;

  return {
    createStripeWebhookDeps: () => ({
      paymentGateway: gateways.createPaymentGateway(),
      logger: primitives.logger,
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
      rateLimiter: gateways.createRateLimiter(),
      idempotencyKeyRepository: repositories.createIdempotencyKeyRepository(),
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
      createCheckoutSessionUseCase: useCases.createCheckoutSessionUseCase(),
      createPortalSessionUseCase: useCases.createPortalSessionUseCase(),
      idempotencyKeyRepository: repositories.createIdempotencyKeyRepository(),
      rateLimiter: gateways.createRateLimiter(),
      getClerkUserId: async () => (await getClerkUser())?.id ?? null,
      appUrl: primitives.env.NEXT_PUBLIC_APP_URL,
      now: primitives.now,
    }),
    createBookmarkControllerDeps: () => ({
      authGateway: gateways.createAuthGateway(),
      rateLimiter: gateways.createRateLimiter(),
      checkEntitlementUseCase: useCases.createCheckEntitlementUseCase(),
      toggleBookmarkUseCase: useCases.createToggleBookmarkUseCase(),
      getBookmarksUseCase: useCases.createGetBookmarksUseCase(),
    }),
    createPracticeControllerDeps: () => ({
      authGateway: gateways.createAuthGateway(),
      rateLimiter: gateways.createRateLimiter(),
      idempotencyKeyRepository: repositories.createIdempotencyKeyRepository(),
      checkEntitlementUseCase: useCases.createCheckEntitlementUseCase(),
      getIncompletePracticeSessionUseCase:
        useCases.createGetIncompletePracticeSessionUseCase(),
      getPracticeSessionReviewUseCase:
        useCases.createGetPracticeSessionReviewUseCase(),
      setPracticeSessionQuestionMarkUseCase:
        useCases.createSetPracticeSessionQuestionMarkUseCase(),
      startPracticeSessionUseCase: useCases.createStartPracticeSessionUseCase(),
      endPracticeSessionUseCase: useCases.createEndPracticeSessionUseCase(),
      now: primitives.now,
    }),
    createReviewControllerDeps: () => ({
      authGateway: gateways.createAuthGateway(),
      checkEntitlementUseCase: useCases.createCheckEntitlementUseCase(),
      getMissedQuestionsUseCase: useCases.createGetMissedQuestionsUseCase(),
    }),
    createStatsControllerDeps: () => ({
      authGateway: gateways.createAuthGateway(),
      checkEntitlementUseCase: useCases.createCheckEntitlementUseCase(),
      getUserStatsUseCase: useCases.createGetUserStatsUseCase(),
    }),
    createTagControllerDeps: () => ({
      authGateway: gateways.createAuthGateway(),
      checkEntitlementUseCase: useCases.createCheckEntitlementUseCase(),
      tagRepository: repositories.createTagRepository(),
      logger: primitives.logger,
    }),
  };
}
