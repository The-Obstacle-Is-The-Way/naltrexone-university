import { getPostgresErrorCode } from '@/src/adapters/repositories/postgres-errors';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';
import {
  ApplicationError,
  PracticeSessionConflictReasons,
} from '@/src/application/errors';
import {
  CheckEntitlementUseCase,
  CountAvailableQuestionsUseCase,
  CreateCheckoutSessionUseCase,
  CreatePortalSessionUseCase,
  DiscardPracticeSessionUseCase,
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
  SetBookmarkUseCase,
  SetPracticeSessionQuestionMarkUseCase,
  StartPracticeSessionUseCase,
  SubmitAnswerUseCase,
  SubmitQuestionReportUseCase,
} from '@/src/application/use-cases';
import type {
  ContainerPrimitives,
  GatewayFactories,
  RepositoryFactories,
  UseCaseFactories,
} from './types';

const PRACTICE_SESSION_STATE_WRITE_TRANSACTION_CONFIG = {
  isolationLevel: 'repeatable read',
} as const;
const PRACTICE_SESSION_STATE_WRITE_TRANSACTION_MAX_ATTEMPTS = 3;
const PRACTICE_SESSION_STATE_WRITE_TRANSACTION_BASE_RETRY_DELAY_MS = 25;
const PRACTICE_SESSION_STATE_WRITE_TRANSACTION_MAX_RETRY_DELAY_MS = 250;
const RETRYABLE_PRACTICE_SESSION_STATE_WRITE_CODES = new Set([
  '40001',
  '40P01',
]);

function isRetryablePracticeSessionStateWriteFailure(error: unknown): boolean {
  const postgresError =
    error instanceof ApplicationError
      ? (error as { cause?: unknown }).cause
      : error;
  const code = getPostgresErrorCode(postgresError);
  return (
    code !== null && RETRYABLE_PRACTICE_SESSION_STATE_WRITE_CODES.has(code)
  );
}

function getPracticeSessionStateWriteRetryDelayMs(attempt: number): number {
  const cappedExponentialDelayMs = Math.min(
    PRACTICE_SESSION_STATE_WRITE_TRANSACTION_BASE_RETRY_DELAY_MS * 2 ** attempt,
    PRACTICE_SESSION_STATE_WRITE_TRANSACTION_MAX_RETRY_DELAY_MS,
  );
  const jitterMs = Math.floor(Math.random() * cappedExponentialDelayMs);
  return Math.min(
    cappedExponentialDelayMs + jitterMs,
    PRACTICE_SESSION_STATE_WRITE_TRANSACTION_MAX_RETRY_DELAY_MS,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runPracticeSessionStateWriteTransaction<T>(
  primitives: ContainerPrimitives,
  action: (tx: DrizzleDb) => Promise<T>,
): Promise<T> {
  let lastRetryableError: unknown;

  for (
    let attempt = 0;
    attempt < PRACTICE_SESSION_STATE_WRITE_TRANSACTION_MAX_ATTEMPTS;
    attempt += 1
  ) {
    try {
      return await primitives.db.transaction(
        async (tx) => action(tx as unknown as DrizzleDb),
        PRACTICE_SESSION_STATE_WRITE_TRANSACTION_CONFIG,
      );
    } catch (error) {
      if (!isRetryablePracticeSessionStateWriteFailure(error)) {
        throw error;
      }
      lastRetryableError = error;
      if (attempt + 1 < PRACTICE_SESSION_STATE_WRITE_TRANSACTION_MAX_ATTEMPTS) {
        await sleep(getPracticeSessionStateWriteRetryDelayMs(attempt));
      }
    }
  }

  throw new ApplicationError(
    'CONFLICT',
    'Practice session state changed concurrently; please retry.',
    undefined,
    {
      cause: lastRetryableError,
      details: {
        reason: PracticeSessionConflictReasons.StateChangedConcurrently,
      },
    },
  );
}

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
        runPracticeSessionStateWriteTransaction(primitives, async (tx) =>
          fn({
            questions: repositories.createQuestionRepository(tx),
            attempts: repositories.createAttemptRepository(tx),
            sessions: repositories.createPracticeSessionRepository(tx),
          }),
        ),
      primitives.now,
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
    createDiscardPracticeSessionUseCase: () =>
      new DiscardPracticeSessionUseCase(
        repositories.createPracticeSessionRepository(),
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
    createGetQuestionRatingUseCase: () =>
      new GetQuestionRatingUseCase(
        repositories.createQuestionFeedbackRepository(),
        repositories.createQuestionRepository(),
      ),
    createRateQuestionUseCase: () =>
      new RateQuestionUseCase(
        repositories.createQuestionFeedbackRepository(),
        repositories.createQuestionRepository(),
        repositories.createAttemptRepository(),
        repositories.createPracticeSessionRepository(),
      ),
    createSubmitQuestionReportUseCase: () =>
      new SubmitQuestionReportUseCase(
        repositories.createQuestionFeedbackRepository(),
        repositories.createQuestionRepository(),
        repositories.createAttemptRepository(),
        repositories.createPracticeSessionRepository(),
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
          runPracticeSessionStateWriteTransaction(primitives, async (tx) =>
            fn({
              attempts: repositories.createAttemptRepository(tx),
              sessions: repositories.createPracticeSessionRepository(tx),
            }),
          ),
      ),
    createSetBookmarkUseCase: () =>
      new SetBookmarkUseCase(
        repositories.createBookmarkRepository(),
        repositories.createQuestionRepository(),
      ),
  };
}
