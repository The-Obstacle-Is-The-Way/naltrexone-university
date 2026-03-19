'use server';

import { createDepsResolver, loadAppContainer } from '@/lib/controller-helpers';
import { START_PRACTICE_SESSION_RATE_LIMIT } from '@/src/adapters/shared/rate-limits';
import { withIdempotency } from '@/src/adapters/shared/with-idempotency';
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
  SaveExamDraftAnswerOutput,
  SetPracticeSessionQuestionMarkInput,
  SetPracticeSessionQuestionMarkOutput,
  StartPracticeSessionInput,
  StartPracticeSessionOutput,
} from '@/src/application/use-cases';
import { createAction } from './create-action';
import {
  CountAvailableQuestionsInputSchema,
  CountAvailableQuestionsOutputSchema,
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

export type {
  CountAvailableQuestionsOutput,
  EndPracticeSessionOutput,
  FinalizeExamAnswersOutput,
  GetCompletedSessionQuestionsWithFeedbackOutput,
  GetIncompletePracticeSessionOutput,
  GetPracticeSessionReviewOutput,
  GetPracticeSessionSummaryOutput,
  GetSessionHistoryOutput,
  SaveExamDraftAnswerOutput,
  SetPracticeSessionQuestionMarkOutput,
  StartPracticeSessionOutput,
} from '@/src/application/use-cases';

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
    ) => Promise<SaveExamDraftAnswerOutput>;
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

export const startPracticeSession = createAction({
  schema: StartPracticeSessionInputSchema,
  getDeps,
  execute: async (input, d) => {
    const userId = await requireEntitledUserId(d);

    const { mode, count, tagSlugs, difficulties, statuses, idempotencyKey } =
      input;

    async function createNewSession(): Promise<StartPracticeSessionOutput> {
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

      return d.startPracticeSessionUseCase.execute({
        userId,
        mode,
        count,
        tagSlugs,
        difficulties,
        statuses,
      });
    }

    if (!idempotencyKey) {
      return createNewSession();
    }

    return withIdempotency({
      repo: d.idempotencyKeyRepository,
      logger: d.logger,
      userId,
      action: 'practice:startPracticeSession',
      key: idempotencyKey,
      now: d.now,
      parseResult: (value) => StartPracticeSessionOutputSchema.parse(value),
      execute: createNewSession,
    });
  },
});

export const countAvailableQuestions = createAction({
  schema: CountAvailableQuestionsInputSchema,
  getDeps,
  execute: async (input, d) => {
    const userId = await requireEntitledUserId(d);

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
  execute: async (_input, d) => {
    const userId = await requireEntitledUserId(d);
    const output = await d.getIncompletePracticeSessionUseCase.execute({
      userId,
    });
    return GetIncompletePracticeSessionOutputSchema.parse(output);
  },
});

export const getCompletedSessionQuestionsWithFeedback = createAction({
  schema: GetCompletedSessionQuestionsWithFeedbackInputSchema,
  getDeps,
  execute: async (input, d) => {
    const userId = await requireEntitledUserId(d);
    return d.getCompletedSessionQuestionsWithFeedbackUseCase.execute({
      userId,
      sessionId: input.sessionId,
    });
  },
});

export const endPracticeSession = createAction({
  schema: EndPracticeSessionInputSchema,
  getDeps,
  execute: async (input, d) => {
    const userId = await requireEntitledUserId(d);

    const { sessionId, idempotencyKey } = input;

    async function endSession(): Promise<EndPracticeSessionOutput> {
      return d.endPracticeSessionUseCase.execute({
        userId,
        sessionId,
      });
    }

    if (!idempotencyKey) {
      return endSession();
    }

    return withIdempotency({
      repo: d.idempotencyKeyRepository,
      logger: d.logger,
      userId,
      action: 'practice:endPracticeSession',
      key: idempotencyKey,
      now: d.now,
      parseResult: (value) => EndPracticeSessionOutputSchema.parse(value),
      execute: endSession,
    });
  },
});

export const finalizeExamAnswers = createAction({
  schema: FinalizeExamAnswersInputSchema,
  getDeps,
  execute: async (input, d) => {
    const userId = await requireEntitledUserId(d);

    const { sessionId, idempotencyKey } = input;

    async function finalizeExam(): Promise<FinalizeExamAnswersOutput> {
      return FinalizeExamAnswersOutputSchema.parse(
        await d.finalizeExamAnswersUseCase.execute({
          userId,
          sessionId,
        }),
      );
    }

    if (!idempotencyKey) {
      return finalizeExam();
    }

    return withIdempotency({
      repo: d.idempotencyKeyRepository,
      logger: d.logger,
      userId,
      action: 'practice:finalizeExamAnswers',
      key: idempotencyKey,
      now: d.now,
      parseResult: (value) => FinalizeExamAnswersOutputSchema.parse(value),
      execute: finalizeExam,
    });
  },
});

export const getPracticeSessionReview = createAction({
  schema: GetPracticeSessionReviewInputSchema,
  getDeps,
  execute: async (input, d) => {
    const userId = await requireEntitledUserId(d);
    return d.getPracticeSessionReviewUseCase.execute({
      userId,
      sessionId: input.sessionId,
    });
  },
});

export const saveExamDraftAnswer = createAction({
  schema: SaveExamDraftAnswerInputSchema,
  getDeps,
  execute: async (input, d) => {
    const userId = await requireEntitledUserId(d);

    return SaveExamDraftAnswerOutputSchema.parse(
      await d.saveExamDraftAnswerUseCase.execute({
        userId,
        sessionId: input.sessionId,
        questionId: input.questionId,
        selectedChoiceId: input.selectedChoiceId,
        cumulativeMs: input.cumulativeMs,
      }),
    );
  },
});

export const getPracticeSessionSummary = createAction({
  schema: GetPracticeSessionSummaryInputSchema,
  getDeps,
  execute: async (input, d) => {
    const userId = await requireEntitledUserId(d);
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
  execute: async (input, d) => {
    const userId = await requireEntitledUserId(d);
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
  execute: async (input, d) => {
    const userId = await requireEntitledUserId(d);

    const { sessionId, questionId, markedForReview, idempotencyKey } = input;

    async function setMark(): Promise<SetPracticeSessionQuestionMarkOutput> {
      return d.setPracticeSessionQuestionMarkUseCase.execute({
        userId,
        sessionId,
        questionId,
        markedForReview,
      });
    }

    if (!idempotencyKey) {
      return setMark();
    }

    return withIdempotency({
      repo: d.idempotencyKeyRepository,
      logger: d.logger,
      userId,
      action: 'practice:setPracticeSessionQuestionMark',
      key: idempotencyKey,
      now: d.now,
      parseResult: (value) =>
        SetPracticeSessionQuestionMarkOutputSchema.parse(value),
      execute: setMark,
    });
  },
});
