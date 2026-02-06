import {
  CheckEntitlementUseCase,
  CreateCheckoutSessionUseCase,
  CreatePortalSessionUseCase,
  EndPracticeSessionUseCase,
  GetBookmarksUseCase,
  GetIncompletePracticeSessionUseCase,
  GetMissedQuestionsUseCase,
  GetNextQuestionUseCase,
  GetPracticeSessionReviewUseCase,
  GetUserStatsUseCase,
  SetPracticeSessionQuestionMarkUseCase,
  StartPracticeSessionUseCase,
  SubmitAnswerUseCase,
  ToggleBookmarkUseCase,
} from '@/src/application/use-cases';
import type {
  ContainerPrimitives,
  GatewayFactories,
  RepositoryFactories,
  UseCaseFactories,
} from './types';

export function createUseCaseFactories(input: {
  primitives: ContainerPrimitives;
  repositories: RepositoryFactories;
  gateways: GatewayFactories;
}): UseCaseFactories {
  const { primitives, repositories, gateways } = input;

  return {
    createCheckEntitlementUseCase: () =>
      new CheckEntitlementUseCase(
        repositories.createSubscriptionRepository(),
        primitives.now,
      ),
    createCheckoutSessionUseCase: () =>
      new CreateCheckoutSessionUseCase(
        repositories.createStripeCustomerRepository(),
        repositories.createSubscriptionRepository(),
        gateways.createPaymentGateway(),
        primitives.now,
      ),
    createPortalSessionUseCase: () =>
      new CreatePortalSessionUseCase(
        repositories.createStripeCustomerRepository(),
        gateways.createPaymentGateway(),
      ),
    createEndPracticeSessionUseCase: () =>
      new EndPracticeSessionUseCase(
        repositories.createPracticeSessionRepository(),
      ),
    createGetNextQuestionUseCase: () =>
      new GetNextQuestionUseCase(
        repositories.createQuestionRepository(),
        repositories.createAttemptRepository(),
        repositories.createPracticeSessionRepository(),
      ),
    createGetBookmarksUseCase: () =>
      new GetBookmarksUseCase(
        repositories.createBookmarkRepository(),
        repositories.createQuestionRepository(),
        primitives.logger,
      ),
    createGetIncompletePracticeSessionUseCase: () =>
      new GetIncompletePracticeSessionUseCase(
        repositories.createPracticeSessionRepository(),
      ),
    createGetMissedQuestionsUseCase: () =>
      new GetMissedQuestionsUseCase(
        repositories.createAttemptRepository(),
        repositories.createQuestionRepository(),
        primitives.logger,
      ),
    createGetPracticeSessionReviewUseCase: () =>
      new GetPracticeSessionReviewUseCase(
        repositories.createPracticeSessionRepository(),
        repositories.createQuestionRepository(),
        primitives.logger,
      ),
    createGetUserStatsUseCase: () =>
      new GetUserStatsUseCase(
        repositories.createAttemptRepository(),
        repositories.createQuestionRepository(),
        primitives.logger,
        primitives.now,
      ),
    createSetPracticeSessionQuestionMarkUseCase: () =>
      new SetPracticeSessionQuestionMarkUseCase(
        repositories.createPracticeSessionRepository(),
      ),
    createStartPracticeSessionUseCase: () =>
      new StartPracticeSessionUseCase(
        repositories.createQuestionRepository(),
        repositories.createPracticeSessionRepository(),
        primitives.now,
      ),
    createSubmitAnswerUseCase: () =>
      new SubmitAnswerUseCase(
        repositories.createQuestionRepository(),
        repositories.createAttemptRepository(),
        repositories.createPracticeSessionRepository(),
      ),
    createToggleBookmarkUseCase: () =>
      new ToggleBookmarkUseCase(
        repositories.createBookmarkRepository(),
        repositories.createQuestionRepository(),
      ),
  };
}
