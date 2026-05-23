import {
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
  GetSessionHistoryUseCase,
  GetUserStatsUseCase,
  SaveExamDraftAnswerUseCase,
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
  const createFinalizeExamAnswersUseCase = () =>
    new FinalizeExamAnswersUseCase(
      repositories.createQuestionRepository(),
      repositories.createAttemptRepository(),
      repositories.createPracticeSessionRepository(),
      async (fn) =>
        primitives.db.transaction(async (tx) =>
          fn({
            questions: repositories.createQuestionRepository(tx),
            attempts: repositories.createAttemptRepository(tx),
            sessions: repositories.createPracticeSessionRepository(tx),
          }),
        ),
    );

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
        primitives.logger,
        primitives.now,
      ),
    createPortalSessionUseCase: () =>
      new CreatePortalSessionUseCase(
        repositories.createStripeCustomerRepository(),
        gateways.createPaymentGateway(),
      ),
    createCountAvailableQuestionsUseCase: () =>
      new CountAvailableQuestionsUseCase(
        repositories.createQuestionRepository(),
      ),
    createEndPracticeSessionUseCase: () =>
      new EndPracticeSessionUseCase(
        repositories.createPracticeSessionRepository(),
      ),
    createFinalizeExamAnswersUseCase,
    createSaveExamDraftAnswerUseCase: () =>
      new SaveExamDraftAnswerUseCase(
        repositories.createQuestionRepository(),
        repositories.createPracticeSessionRepository(),
        primitives.now,
      ),
    createGetNextQuestionUseCase: () =>
      new GetNextQuestionUseCase(
        repositories.createQuestionRepository(),
        repositories.createAttemptRepository(),
        repositories.createPracticeSessionRepository(),
        primitives.now,
        {
          execute: (input) => createFinalizeExamAnswersUseCase().execute(input),
        },
      ),
    createGetPreviousAttemptUseCase: () =>
      new GetPreviousAttemptUseCase(
        repositories.createAttemptRepository(),
        repositories.createQuestionRepository(),
        primitives.logger,
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
    createGetCompletedSessionQuestionsWithFeedbackUseCase: () =>
      new GetCompletedSessionQuestionsWithFeedbackUseCase(
        repositories.createPracticeSessionRepository(),
        repositories.createQuestionRepository(),
        repositories.createAttemptRepository(),
        primitives.logger,
      ),
    createGetAttemptedQuestionsUseCase: () =>
      new GetAttemptedQuestionsUseCase(
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
    createGetPracticeSessionSummaryUseCase: () =>
      new GetPracticeSessionSummaryUseCase(
        repositories.createPracticeSessionRepository(),
      ),
    createGetSessionHistoryUseCase: () =>
      new GetSessionHistoryUseCase(
        repositories.createPracticeSessionRepository(),
        repositories.createQuestionRepository(),
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
        primitives.logger,
        async (fn) =>
          primitives.db.transaction(async (tx) =>
            fn({
              attempts: repositories.createAttemptRepository(tx),
              sessions: repositories.createPracticeSessionRepository(tx),
            }),
          ),
      ),
    createToggleBookmarkUseCase: () =>
      new ToggleBookmarkUseCase(
        repositories.createBookmarkRepository(),
        repositories.createQuestionRepository(),
      ),
  };
}
