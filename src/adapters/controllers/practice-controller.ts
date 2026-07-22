'use server';

// WHY large-file: this controller is the server-action facade for the practice use-case cluster; splitting it would hide shared auth/rate-limit/action-result conventions.
import { createDepsResolver, loadAppContainer } from '@/lib/controller-helpers';
import {
  EXAM_DRAFT_SAVE_RATE_LIMIT,
  PRACTICE_SESSION_MUTATION_RATE_LIMIT,
  START_PRACTICE_SESSION_RATE_LIMIT,
} from '@/src/adapters/shared/rate-limits';
import { ApplicationError } from '@/src/application/errors';
import type {
  AuthGateway,
  RateLimiter,
} from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';
import type { IdempotencyKeyRepository } from '@/src/application/ports/repositories';
import type {
  CountAvailableQuestionsInput,
  CountAvailableQuestionsOutput,
  DiscardPracticeSessionInput,
  DiscardPracticeSessionOutput,
  EndPracticeSessionInput,
  EndPracticeSessionOutput,
  FinalizeExamAnswersInput,
  FinalizeExamAnswersOutput,
  GetCompletedSessionQuestionsWithFeedbackInput,
  GetCompletedSessionQuestionsWithFeedbackOutput,
  GetIncompletePracticeSessionInput,
  GetIncompletePracticeSessionOutput,
  GetPracticeSessionReviewInput,
  GetPracticeSessionReviewOutput,
  GetPracticeSessionSummaryInput,
  GetPracticeSessionSummaryOutput,
  GetSessionHistoryInput,
  GetSessionHistoryOutput,
  SaveExamDraftAnswerInput,
  SaveExamDraftAnswerOutput as SaveExamDraftAnswerUseCaseOutput,
  SetPracticeSessionQuestionMarkInput,
  SetPracticeSessionQuestionMarkOutput,
  StartPracticeSessionInput,
  StartPracticeSessionOutput,
} from '@/src/application/use-cases';
import { createAction } from './create-action';
import type { SaveExamDraftAnswerOutput } from './practice-schemas';
import {
  CountAvailableQuestionsInputSchema,
  CountAvailableQuestionsOutputSchema,
  DiscardPracticeSessionInputSchema,
  DiscardPracticeSessionOutputSchema,
  EmptyInputSchema,
  EndPracticeSessionInputSchema,
  EndPracticeSessionOutputSchema,
  FinalizeExamAnswersInputSchema,
  FinalizeExamAnswersOutputSchema,
  GetCompletedSessionQuestionsWithFeedbackInputSchema,
  GetIncompletePracticeSessionOutputSchema,
  GetPracticeSessionReviewInputSchema,
  GetPracticeSessionSummaryInputSchema,
  GetSessionHistoryInputSchema,
  PracticeSessionSummaryOutputSchema,
  SaveExamDraftAnswerInputSchema,
  SaveExamDraftAnswerOutputSchema,
  SetPracticeSessionQuestionMarkInputSchema,
  SetPracticeSessionQuestionMarkOutputSchema,
  StartPracticeSessionInputSchema,
  StartPracticeSessionOutputSchema,
} from './practice-schemas';
import type { CheckEntitlementUseCase } from './require-entitled-user-id';
import { requireEntitledUserId } from './require-entitled-user-id';
import { executeIdempotent } from './shared/execute-idempotent';
import {
  IdempotentActionNames,
  shouldCacheQuestionMarkError,
  shouldCacheStartPracticeSessionError,
} from './shared/idempotency-error-policy';
import {
  shouldCachePracticeSessionLifecycleError,
  shouldCachePracticeSessionStateWriteError,
} from './shared/practice-session-idempotency-policy';

export type {
  CountAvailableQuestionsOutput,
  DiscardPracticeSessionOutput,
  EndPracticeSessionOutput,
  FinalizeExamAnswersOutput,
  GetCompletedSessionQuestionsWithFeedbackOutput,
  GetIncompletePracticeSessionOutput,
  GetPracticeSessionReviewOutput,
  GetPracticeSessionSummaryOutput,
  GetSessionHistoryOutput,
  SetPracticeSessionQuestionMarkOutput,
  StartPracticeSessionOutput,
} from '@/src/application/use-cases';
export type { SaveExamDraftAnswerOutput } from './practice-schemas';

export type PracticeControllerDeps = {
  authGateway: AuthGateway;
  logger: Logger;
  rateLimiter: RateLimiter;
  idempotencyKeyRepository: IdempotencyKeyRepository;
  checkEntitlementUseCase: CheckEntitlementUseCase;
  getIncompletePracticeSessionUseCase: {
    execute: (
      input: GetIncompletePracticeSessionInput,
    ) => Promise<GetIncompletePracticeSessionOutput>;
  };
  getCompletedSessionQuestionsWithFeedbackUseCase: {
    execute: (
      input: GetCompletedSessionQuestionsWithFeedbackInput,
    ) => Promise<GetCompletedSessionQuestionsWithFeedbackOutput>;
  };
  startPracticeSessionUseCase: {
    execute: (
      input: StartPracticeSessionInput,
    ) => Promise<StartPracticeSessionOutput>;
  };
  countAvailableQuestionsUseCase: {
    execute: (
      input: CountAvailableQuestionsInput,
    ) => Promise<CountAvailableQuestionsOutput>;
  };
  discardPracticeSessionUseCase: {
    execute: (
      input: DiscardPracticeSessionInput,
    ) => Promise<DiscardPracticeSessionOutput>;
  };
  endPracticeSessionUseCase: {
    execute: (
      input: EndPracticeSessionInput,
    ) => Promise<EndPracticeSessionOutput>;
  };
  finalizeExamAnswersUseCase: {
    execute: (
      input: FinalizeExamAnswersInput,
    ) => Promise<FinalizeExamAnswersOutput>;
  };
  saveExamDraftAnswerUseCase: {
    execute: (
      input: SaveExamDraftAnswerInput,
    ) => Promise<SaveExamDraftAnswerUseCaseOutput>;
  };
  getPracticeSessionReviewUseCase: {
    execute: (
      input: GetPracticeSessionReviewInput,
    ) => Promise<GetPracticeSessionReviewOutput>;
  };
  getPracticeSessionSummaryUseCase: {
    execute: (
      input: GetPracticeSessionSummaryInput,
    ) => Promise<GetPracticeSessionSummaryOutput>;
  };
  getSessionHistoryUseCase: {
    execute: (
      input: GetSessionHistoryInput,
    ) => Promise<GetSessionHistoryOutput>;
  };
  setPracticeSessionQuestionMarkUseCase: {
    execute: (
      input: SetPracticeSessionQuestionMarkInput,
    ) => Promise<SetPracticeSessionQuestionMarkOutput>;
  };
  now: () => Date;
};

type PracticeControllerContainer = {
  createPracticeControllerDeps: () => PracticeControllerDeps;
};

const getDeps = createDepsResolver<
  PracticeControllerDeps,
  PracticeControllerContainer
>((container) => container.createPracticeControllerDeps(), loadAppContainer);

function serializeSaveExamDraftAnswerOutput(
  output: SaveExamDraftAnswerUseCaseOutput,
): SaveExamDraftAnswerOutput {
  return {
    ...output,
    latestAnsweredAt: output.latestAnsweredAt?.toISOString() ?? null,
    draftSavedAt: output.draftSavedAt?.toISOString() ?? null,
  };
}

async function enforceRateLimit(input: {
  rateLimiter: RateLimiter;
  key: string;
  policy: { readonly limit: number; readonly windowMs: number };
  message: (retryAfterSeconds: number) => string;
}): Promise<void> {
  const rate = await input.rateLimiter.limit({
    key: input.key,
    ...input.policy,
  });
  if (!rate.success) {
    throw new ApplicationError(
      'RATE_LIMITED',
      input.message(rate.retryAfterSeconds),
    );
  }
}

export const startPracticeSession = createAction({
  schema: StartPracticeSessionInputSchema,
  getDeps,
  execute: async (input, d, meta) => {
    const userId = await requireEntitledUserId(d, meta);

    const { mode, count, tagSlugs, difficulties, statuses, idempotencyKey } =
      input;

    async function createNewSession(): Promise<StartPracticeSessionOutput> {
      return d.startPracticeSessionUseCase.execute({
        userId,
        mode,
        count,
        tagSlugs,
        difficulties,
        statuses,
      });
    }

    return executeIdempotent({
      d,
      userId,
      action: IdempotentActionNames.StartPracticeSession,
      idempotencyKey,
      outputSchema: StartPracticeSessionOutputSchema,
      beforeExecute: () =>
        enforceRateLimit({
          rateLimiter: d.rateLimiter,
          key: `${IdempotentActionNames.StartPracticeSession}:${userId}`,
          policy: START_PRACTICE_SESSION_RATE_LIMIT,
          message: (retryAfterSeconds) =>
            `Too many session starts. Try again in ${retryAfterSeconds}s.`,
        }),
      // Abort claims for transient failures so the client's preserved key
      // re-executes instead of replaying a poisoned error; cache only the
      // determinate outcomes in the start policy's vetted set.
      shouldCacheError: shouldCacheStartPracticeSessionError,
      outcomeStoreFailurePolicy: 'cache-error-and-throw',
      execute: createNewSession,
    });
  },
});

export const countAvailableQuestions = createAction({
  schema: CountAvailableQuestionsInputSchema,
  getDeps,
  execute: async (input, d, meta) => {
    const userId = await requireEntitledUserId(d, meta);

    const output = await d.countAvailableQuestionsUseCase.execute({
      userId,
      tagSlugs: input.tagSlugs,
      difficulties: input.difficulties,
      statuses: input.statuses,
    });

    return CountAvailableQuestionsOutputSchema.parse(output);
  },
});

export const getIncompletePracticeSession = createAction({
  schema: EmptyInputSchema,
  getDeps,
  execute: async (_input, d, meta) => {
    const userId = await requireEntitledUserId(d, meta);
    const output = await d.getIncompletePracticeSessionUseCase.execute({
      userId,
    });
    return GetIncompletePracticeSessionOutputSchema.parse(output);
  },
});

export const getCompletedSessionQuestionsWithFeedback = createAction({
  schema: GetCompletedSessionQuestionsWithFeedbackInputSchema,
  getDeps,
  execute: async (input, d, meta) => {
    const userId = await requireEntitledUserId(d, meta);
    return d.getCompletedSessionQuestionsWithFeedbackUseCase.execute({
      userId,
      sessionId: input.sessionId,
    });
  },
});

export const endPracticeSession = createAction({
  schema: EndPracticeSessionInputSchema,
  getDeps,
  execute: async (input, d, meta) => {
    const userId = await requireEntitledUserId(d, meta);

    const { sessionId, idempotencyKey } = input;

    return executeIdempotent({
      d,
      userId,
      action: 'practice:endPracticeSession',
      idempotencyKey,
      outputSchema: EndPracticeSessionOutputSchema,
      beforeExecute: () =>
        enforceRateLimit({
          rateLimiter: d.rateLimiter,
          key: `practice:endPracticeSession:${userId}`,
          policy: PRACTICE_SESSION_MUTATION_RATE_LIMIT,
          message: (retryAfterSeconds) =>
            `Too many session mutations. Try again in ${retryAfterSeconds}s.`,
        }),
      shouldCacheError: shouldCachePracticeSessionLifecycleError,
      execute: () =>
        d.endPracticeSessionUseCase.execute({
          userId,
          sessionId,
        }),
    });
  },
});

export const discardPracticeSession = createAction({
  schema: DiscardPracticeSessionInputSchema,
  getDeps,
  execute: async (input, d, meta) => {
    const userId = await requireEntitledUserId(d, meta);

    const { sessionId, idempotencyKey } = input;

    return executeIdempotent({
      d,
      userId,
      action: 'practice:discardPracticeSession',
      idempotencyKey,
      outputSchema: DiscardPracticeSessionOutputSchema,
      beforeExecute: () =>
        enforceRateLimit({
          rateLimiter: d.rateLimiter,
          key: `practice:discardPracticeSession:${userId}`,
          policy: PRACTICE_SESSION_MUTATION_RATE_LIMIT,
          message: (retryAfterSeconds) =>
            `Too many session mutations. Try again in ${retryAfterSeconds}s.`,
        }),
      shouldCacheError: shouldCachePracticeSessionLifecycleError,
      execute: () =>
        d.discardPracticeSessionUseCase.execute({
          userId,
          sessionId,
        }),
    });
  },
});

export const finalizeExamAnswers = createAction({
  schema: FinalizeExamAnswersInputSchema,
  getDeps,
  execute: async (input, d, meta) => {
    const userId = await requireEntitledUserId(d, meta);

    const { sessionId, idempotencyKey, finalDraftAnswer } = input;

    async function finalizeExam(): Promise<FinalizeExamAnswersOutput> {
      return FinalizeExamAnswersOutputSchema.parse(
        await d.finalizeExamAnswersUseCase.execute({
          userId,
          sessionId,
          ...(finalDraftAnswer ? { finalDraftAnswer } : {}),
        }),
      );
    }

    return executeIdempotent({
      d,
      userId,
      action: 'practice:finalizeExamAnswers',
      idempotencyKey,
      outputSchema: FinalizeExamAnswersOutputSchema,
      beforeExecute: () =>
        enforceRateLimit({
          rateLimiter: d.rateLimiter,
          key: `practice:finalizeExamAnswers:${userId}`,
          policy: PRACTICE_SESSION_MUTATION_RATE_LIMIT,
          message: (retryAfterSeconds) =>
            `Too many session mutations. Try again in ${retryAfterSeconds}s.`,
        }),
      shouldCacheError: shouldCachePracticeSessionStateWriteError,
      execute: finalizeExam,
    });
  },
});

export const getPracticeSessionReview = createAction({
  schema: GetPracticeSessionReviewInputSchema,
  getDeps,
  execute: async (input, d, meta) => {
    const userId = await requireEntitledUserId(d, meta);
    return d.getPracticeSessionReviewUseCase.execute({
      userId,
      sessionId: input.sessionId,
    });
  },
});

export const saveExamDraftAnswer = createAction({
  schema: SaveExamDraftAnswerInputSchema,
  getDeps,
  execute: async (input, d, meta) => {
    const userId = await requireEntitledUserId(d, meta);

    await enforceRateLimit({
      rateLimiter: d.rateLimiter,
      key: `practice:saveExamDraftAnswer:${userId}`,
      policy: EXAM_DRAFT_SAVE_RATE_LIMIT,
      message: (retryAfterSeconds) =>
        `Too many exam draft saves. Try again in ${retryAfterSeconds}s.`,
    });

    const output = await d.saveExamDraftAnswerUseCase.execute({
      userId,
      sessionId: input.sessionId,
      questionId: input.questionId,
      selectedChoiceId: input.selectedChoiceId,
      cumulativeMs: input.cumulativeMs,
    });

    return SaveExamDraftAnswerOutputSchema.parse(
      serializeSaveExamDraftAnswerOutput(output),
    );
  },
});

export const getPracticeSessionSummary = createAction({
  schema: GetPracticeSessionSummaryInputSchema,
  getDeps,
  execute: async (input, d, meta) => {
    const userId = await requireEntitledUserId(d, meta);
    return PracticeSessionSummaryOutputSchema.parse(
      await d.getPracticeSessionSummaryUseCase.execute({
        userId,
        sessionId: input.sessionId,
      }),
    );
  },
});

export const getSessionHistory = createAction({
  schema: GetSessionHistoryInputSchema,
  getDeps,
  execute: async (input, d, meta) => {
    const userId = await requireEntitledUserId(d, meta);
    return d.getSessionHistoryUseCase.execute({
      userId,
      limit: input.limit,
      offset: input.offset,
      mode: input.mode ?? null,
    });
  },
});

export const setPracticeSessionQuestionMark = createAction({
  schema: SetPracticeSessionQuestionMarkInputSchema,
  getDeps,
  execute: async (input, d, meta) => {
    const userId = await requireEntitledUserId(d, meta);

    const { sessionId, questionId, markedForReview, idempotencyKey } = input;

    return executeIdempotent({
      d,
      userId,
      action: IdempotentActionNames.QuestionMark,
      idempotencyKey,
      outputSchema: SetPracticeSessionQuestionMarkOutputSchema,
      beforeExecute: () =>
        enforceRateLimit({
          rateLimiter: d.rateLimiter,
          key: `practice:setPracticeSessionQuestionMark:${userId}`,
          policy: PRACTICE_SESSION_MUTATION_RATE_LIMIT,
          message: (retryAfterSeconds) =>
            `Too many session mutations. Try again in ${retryAfterSeconds}s.`,
        }),
      shouldCacheError: shouldCacheQuestionMarkError,
      execute: () =>
        d.setPracticeSessionQuestionMarkUseCase.execute({
          userId,
          sessionId,
          questionId,
          markedForReview,
        }),
    });
  },
});
