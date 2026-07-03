'use server';

// WHY large-file: this controller is the server-action facade for the practice use-case cluster; splitting it would hide shared auth/rate-limit/action-result conventions.
import { createDepsResolver, loadAppContainer } from '@/lib/controller-helpers';
import {
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
import { shouldCachePracticeSessionStateWriteError } from './shared/practice-session-idempotency-policy';

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

    async function enforceStartRateLimit(): Promise<void> {
      const rate = await d.rateLimiter.limit({
        key: `practice:startPracticeSession:${userId}`,
        ...START_PRACTICE_SESSION_RATE_LIMIT,
      });
      if (!rate.success) {
        throw new ApplicationError(
          'RATE_LIMITED',
          `Too many session starts. Try again in ${rate.retryAfterSeconds}s.`,
        );
      }
    }

    return executeIdempotent({
      d,
      userId,
      action: 'practice:startPracticeSession',
      idempotencyKey,
      outputSchema: StartPracticeSessionOutputSchema,
      beforeExecute: enforceStartRateLimit,
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

    async function enforceSessionMutationRateLimit(): Promise<void> {
      const rate = await d.rateLimiter.limit({
        key: `practice:discardPracticeSession:${userId}`,
        ...PRACTICE_SESSION_MUTATION_RATE_LIMIT,
      });
      if (!rate.success) {
        throw new ApplicationError(
          'RATE_LIMITED',
          `Too many session mutations. Try again in ${rate.retryAfterSeconds}s.`,
        );
      }
    }

    return executeIdempotent({
      d,
      userId,
      action: 'practice:discardPracticeSession',
      idempotencyKey,
      outputSchema: DiscardPracticeSessionOutputSchema,
      beforeExecute: enforceSessionMutationRateLimit,
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
      action: 'practice:setPracticeSessionQuestionMark',
      idempotencyKey,
      outputSchema: SetPracticeSessionQuestionMarkOutputSchema,
      shouldCacheError: shouldCachePracticeSessionStateWriteError,
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
