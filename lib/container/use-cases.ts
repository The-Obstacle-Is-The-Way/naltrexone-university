import * as Sentry from '@sentry/nextjs';
import {
  CANCELLATION_METHOD,
  PRICING_DATA,
  TERMS_CONTENT_SHA256,
  TERMS_VERSION,
} from '@/lib/pricing-data';
import {
  getPostgresErrorCode,
  toRollbackCertainPersistenceError,
} from '@/src/adapters/repositories/postgres-errors';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';
import {
  projectSafeSpanAttributes,
  SERVER_SPAN_FAMILIES,
} from '@/src/adapters/shared/server-tracing';
import {
  ApplicationError,
  isApplicationError,
  practiceSessionStateChangedConcurrentlyError,
} from '@/src/application/errors';
import {
  CheckEntitlementUseCase,
  CountAvailableQuestionsUseCase,
  CreateCheckoutSessionUseCase,
  CreatePortalSessionUseCase,
  CreateTrialPaymentMethodSetupSessionUseCase,
  DiscardPracticeSessionUseCase,
  DispatchRenewalNoticeDeliveryUseCase,
  EndPracticeSessionUseCase,
  FinalizeExamAnswersUseCase,
  GetAttemptedQuestionsUseCase,
  GetBookmarkQuestionIdsUseCase,
  GetBookmarkStatusUseCase,
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
  PruneRenewalConsentsUseCase,
  RateQuestionUseCase,
  RecordRenewalConsentUseCase,
  RequeueRenewalNoticeDeliveryUseCase,
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

function getRetryablePracticeSessionStateWriteCode(
  error: unknown,
): string | null {
  const postgresError =
    error instanceof ApplicationError
      ? (error as { cause?: unknown }).cause
      : error;
  const code = getPostgresErrorCode(postgresError);
  return code !== null && RETRYABLE_PRACTICE_SESSION_STATE_WRITE_CODES.has(code)
    ? code
    : null;
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
  options?: { classifyStatementCancellation?: boolean },
): Promise<T> {
  // This is intentionally separate from the generic adapter retry helper: each
  // attempt must open a fresh top-level REPEATABLE READ transaction. Only the
  // 40001/40P01 SQLSTATE allowlist retries, with base-plus-uniform jitter, and
  // exhaustion maps to the typed state-changed-concurrently application error.
  let lastRetryableError: unknown;

  for (
    let attempt = 0;
    attempt < PRACTICE_SESSION_STATE_WRITE_TRANSACTION_MAX_ATTEMPTS;
    attempt += 1
  ) {
    try {
      return await primitives.db.transaction(async (tx) => {
        try {
          return await action(tx as unknown as DrizzleDb);
        } catch (error) {
          const rollbackCertainError = options?.classifyStatementCancellation
            ? toRollbackCertainPersistenceError(error, {
                phase: 'transaction_body',
              })
            : null;
          throw rollbackCertainError ?? error;
        }
      }, PRACTICE_SESSION_STATE_WRITE_TRANSACTION_CONFIG);
    } catch (error) {
      const retryableCode = getRetryablePracticeSessionStateWriteCode(error);
      if (retryableCode === null) {
        throw error;
      }
      lastRetryableError = error;
      if (attempt + 1 < PRACTICE_SESSION_STATE_WRITE_TRANSACTION_MAX_ATTEMPTS) {
        const delay = getPracticeSessionStateWriteRetryDelayMs(attempt);
        try {
          primitives.logger.warn(
            {
              attempt: attempt + 1,
              max: PRACTICE_SESSION_STATE_WRITE_TRANSACTION_MAX_ATTEMPTS,
              code: retryableCode,
              delay,
            },
            'Retrying practice session state write transaction',
          );
        } catch {
          // Retry observation is best effort and must not change write behavior.
        }
        await sleep(delay);
      }
    }
  }

  throw practiceSessionStateChangedConcurrentlyError({
    cause: lastRetryableError,
  });
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
      async (fn) => {
        const family = SERVER_SPAN_FAMILIES.finalizeExamAnswers;
        return Sentry.startSpan(
          {
            name: family.name,
            op: family.op,
            attributes: projectSafeSpanAttributes({
              'app.action': family.action,
            }),
          },
          async (span) => {
            try {
              return await runPracticeSessionStateWriteTransaction(
                primitives,
                async (tx) =>
                  fn({
                    questions: repositories.createQuestionRepository(tx),
                    attempts: repositories.createAttemptRepository(tx),
                    sessions: repositories.createPracticeSessionRepository(tx),
                  }),
              );
            } catch (error) {
              if (isApplicationError(error)) {
                span.setAttributes(
                  projectSafeSpanAttributes({
                    'app.error_code': error.code,
                  }),
                );
              }
              throw error;
            }
          },
        );
      },
      primitives.now,
      primitives.logger,
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
        (plan, hasTrial) => {
          const pricing = PRICING_DATA[plan];
          return {
            plan,
            amountCents: pricing.amountCents,
            currency: pricing.currency,
            frequency: pricing.frequency,
            disclosureSnapshot: hasTrial
              ? pricing.trialDisclosure
              : pricing.standardDisclosure,
            disclosureVersion: pricing.disclosureVersion,
            termsVersion: TERMS_VERSION,
            termsHash: TERMS_CONTENT_SHA256,
            cancellationMethod: CANCELLATION_METHOD,
          };
        },
      ),
    createPortalSessionUseCase: () =>
      new CreatePortalSessionUseCase(
        repositories.createStripeCustomerRepository(),
        gateways.createPaymentGateway(),
      ),
    createTrialPaymentMethodSetupSessionUseCase: () =>
      new CreateTrialPaymentMethodSetupSessionUseCase(
        repositories.createSubscriptionRepository(),
        repositories.createStripeCustomerRepository(),
        repositories.createTrialPaymentMethodSetupOperationRepository(),
        gateways.createPaymentGateway(),
        (plan) => {
          const pricing = PRICING_DATA[plan];
          return {
            plan,
            amountCents: pricing.amountCents,
            currency: pricing.currency,
            frequency: pricing.frequency,
            disclosureSnapshot: pricing.trialPaymentDisclosure,
            disclosureVersion: pricing.disclosureVersion,
            termsVersion: TERMS_VERSION,
            termsHash: TERMS_CONTENT_SHA256,
            cancellationMethod: CANCELLATION_METHOD,
          };
        },
        primitives.logger,
        primitives.now,
      ),
    createRecordRenewalConsentUseCase: () =>
      new RecordRenewalConsentUseCase(
        repositories.createRenewalConsentRecordRepository(),
      ),
    createPruneRenewalConsentsUseCase: () =>
      new PruneRenewalConsentsUseCase(
        repositories.createRenewalConsentRecordRepository(),
        primitives.now,
      ),
    createDispatchRenewalNoticeDeliveryUseCase: () =>
      new DispatchRenewalNoticeDeliveryUseCase(
        repositories.createRenewalNoticeDeliveryRepository(),
        gateways.createTransactionalEmailGateway(),
        primitives.now,
      ),
    createRequeueRenewalNoticeDeliveryUseCase: () =>
      new RequeueRenewalNoticeDeliveryUseCase(
        repositories.createRenewalNoticeDeliveryRepository(),
        primitives.now,
      ),
    createCountAvailableQuestionsUseCase: () =>
      new CountAvailableQuestionsUseCase(
        repositories.createQuestionRepository(),
      ),
    createDiscardPracticeSessionUseCase: () =>
      new DiscardPracticeSessionUseCase(async (fn) =>
        runPracticeSessionStateWriteTransaction(primitives, async (tx) =>
          fn(repositories.createPracticeSessionRepository(tx)),
        ),
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
        primitives.logger,
      ),
    createGetBookmarkQuestionIdsUseCase: () =>
      new GetBookmarkQuestionIdsUseCase(
        repositories.createBookmarkRepository(),
      ),
    createGetBookmarkStatusUseCase: () =>
      new GetBookmarkStatusUseCase(repositories.createBookmarkRepository()),
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
          runPracticeSessionStateWriteTransaction(
            primitives,
            async (tx) =>
              fn({
                attempts: repositories.createAttemptRepository(tx),
                sessions: repositories.createPracticeSessionRepository(tx),
              }),
            { classifyStatementCancellation: true },
          ),
      ),
    createSetBookmarkUseCase: () =>
      new SetBookmarkUseCase(
        repositories.createBookmarkRepository(),
        repositories.createQuestionRepository(),
      ),
  };
}
