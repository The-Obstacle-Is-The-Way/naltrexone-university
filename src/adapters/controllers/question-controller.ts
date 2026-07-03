'use server';

import { z } from 'zod';
import { createDepsResolver, loadAppContainer } from '@/lib/controller-helpers';
import { SUBMIT_ANSWER_RATE_LIMIT } from '@/src/adapters/shared/rate-limits';
import {
  MAX_PRACTICE_SESSION_DIFFICULTY_FILTERS,
  MAX_PRACTICE_SESSION_TAG_FILTERS,
  MAX_TIME_SPENT_SECONDS,
} from '@/src/adapters/shared/validation-limits';
import {
  zDifficulty,
  zQuestionProgressStatus,
  zUuid,
} from '@/src/adapters/shared/zod-schemas';
import { ApplicationError } from '@/src/application/errors';
import type {
  AuthGateway,
  RateLimiter,
} from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';
import type { IdempotencyKeyRepository } from '@/src/application/ports/repositories';
import type {
  GetNextQuestionInput,
  GetNextQuestionOutput,
} from '@/src/application/use-cases/get-next-question';
import type {
  SubmitAnswerInput,
  SubmitAnswerOutput,
} from '@/src/application/use-cases/submit-answer';
import { AllAttemptRetryOrigins } from '@/src/domain/entities';
import {
  AllChoiceLabels,
  AllQuestionProgressStatuses,
} from '@/src/domain/value-objects';
import { createAction } from './create-action';
import type { CheckEntitlementUseCase } from './require-entitled-user-id';
import { requireEntitledUserId } from './require-entitled-user-id';
import { executeIdempotent } from './shared/execute-idempotent';
import { shouldCachePracticeSessionStateWriteError } from './shared/practice-session-idempotency-policy';

const QuestionFiltersSchema = z
  .object({
    tagSlugs: z
      .array(z.string().min(1))
      .max(MAX_PRACTICE_SESSION_TAG_FILTERS)
      .default([]),
    difficulties: z
      .array(zDifficulty)
      .max(MAX_PRACTICE_SESSION_DIFFICULTY_FILTERS)
      .default([]),
    statuses: z
      .array(zQuestionProgressStatus)
      .max(AllQuestionProgressStatuses.length)
      .default([]),
  })
  .strict();

const GetNextQuestionInputSchema = z.union([
  z
    .object({
      sessionId: zUuid,
      questionId: zUuid.optional(),
      fromIndex: z.number().int().min(0).optional(),
      filters: z.undefined().optional(),
    })
    .strict(),
  z
    .object({
      sessionId: z.undefined().optional(),
      questionId: z.undefined().optional(),
      fromIndex: z.undefined().optional(),
      filters: QuestionFiltersSchema,
    })
    .strict(),
]);

const SubmitAnswerInputSchema = z
  .object({
    questionId: zUuid,
    choiceId: zUuid,
    sessionId: zUuid.optional(),
    retryOfAttemptId: zUuid.optional(),
    retryOrigin: z.enum(AllAttemptRetryOrigins).optional(),
    retrySessionId: zUuid.optional(),
    idempotencyKey: zUuid.optional(),
    timeSpentSeconds: z
      .number()
      .int()
      .min(0)
      .max(MAX_TIME_SPENT_SECONDS)
      .optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.retryOrigin && input.sessionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sessionId'],
        message: 'sessionId is not allowed for retry submissions',
      });
    }

    if (input.retrySessionId && input.retryOrigin !== 'session_review') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['retrySessionId'],
        message:
          'retrySessionId is only allowed when retryOrigin is session_review',
      });
    }

    if (input.retryOrigin === 'session_review' && !input.retrySessionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['retrySessionId'],
        message:
          'retrySessionId is required when retryOrigin is session_review',
      });
    }

    if (input.retryOfAttemptId && !input.retryOrigin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['retryOrigin'],
        message: 'retryOrigin is required when retryOfAttemptId is provided',
      });
    }

    if (
      input.retryOrigin &&
      input.retryOrigin !== 'session_review' &&
      !input.retryOfAttemptId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['retryOfAttemptId'],
        message:
          'retryOfAttemptId is required for non-session_review retry origins',
      });
    }
  });

const SubmitAnswerOutputSchema = z
  .object({
    attemptId: zUuid,
    isCorrect: z.boolean().nullable(),
    correctChoiceId: zUuid.nullable(),
    explanationMd: z.string().nullable(),
    referenceMd: z.string().nullable().optional().default(null),
    choiceExplanations: z.array(
      z
        .object({
          choiceId: zUuid,
          displayLabel: z.enum(AllChoiceLabels),
          textMd: z.string(),
          isCorrect: z.boolean(),
          explanationMd: z.string().nullable(),
        })
        .strict(),
    ),
  })
  .strict();

type GetNextQuestionUseCase = {
  execute: (input: GetNextQuestionInput) => Promise<GetNextQuestionOutput>;
};

type SubmitAnswerUseCase = {
  execute: (input: SubmitAnswerInput) => Promise<SubmitAnswerOutput>;
};

export type QuestionControllerDeps = {
  authGateway: AuthGateway;
  logger: Logger;
  rateLimiter: RateLimiter;
  idempotencyKeyRepository: IdempotencyKeyRepository;
  now: () => Date;
  checkEntitlementUseCase: CheckEntitlementUseCase;
  getNextQuestionUseCase: GetNextQuestionUseCase;
  submitAnswerUseCase: SubmitAnswerUseCase;
};

type QuestionControllerContainer = {
  createQuestionControllerDeps: () => QuestionControllerDeps;
};

const getDeps = createDepsResolver<
  QuestionControllerDeps,
  QuestionControllerContainer
>((container) => container.createQuestionControllerDeps(), loadAppContainer);

export const getNextQuestion = createAction({
  schema: GetNextQuestionInputSchema,
  getDeps,
  execute: async (input, d, meta) => {
    const userId = await requireEntitledUserId(d, meta);

    if (typeof input.sessionId === 'string') {
      return d.getNextQuestionUseCase.execute({
        userId,
        sessionId: input.sessionId,
        ...(input.questionId !== undefined
          ? { questionId: input.questionId }
          : {}),
        ...(input.fromIndex !== undefined
          ? { fromIndex: input.fromIndex }
          : {}),
      });
    }

    return d.getNextQuestionUseCase.execute({
      userId,
      filters: input.filters,
    });
  },
});

export const submitAnswer = createAction({
  schema: SubmitAnswerInputSchema,
  getDeps,
  execute: async (input, d, meta) => {
    const userId = await requireEntitledUserId(d, meta);

    const {
      questionId,
      choiceId,
      sessionId,
      retryOfAttemptId,
      retryOrigin,
      retrySessionId,
      idempotencyKey,
      timeSpentSeconds,
    } = input;

    async function submitOnce(): Promise<SubmitAnswerOutput> {
      return d.submitAnswerUseCase.execute({
        userId,
        questionId,
        choiceId,
        ...(sessionId !== undefined ? { sessionId } : {}),
        ...(timeSpentSeconds !== undefined ? { timeSpentSeconds } : {}),
        ...(retryOfAttemptId !== undefined ? { retryOfAttemptId } : {}),
        ...(retryOrigin !== undefined ? { retryOrigin } : {}),
        ...(retrySessionId !== undefined ? { retrySessionId } : {}),
      });
    }

    async function enforceSubmitAnswerRateLimit(): Promise<void> {
      const rate = await d.rateLimiter.limit({
        key: `question:submitAnswer:${userId}`,
        ...SUBMIT_ANSWER_RATE_LIMIT,
      });
      if (!rate.success) {
        throw new ApplicationError(
          'RATE_LIMITED',
          `Too many submissions. Try again in ${rate.retryAfterSeconds}s.`,
        );
      }
    }

    return executeIdempotent({
      d,
      userId,
      action: 'question:submitAnswer',
      idempotencyKey,
      outputSchema: SubmitAnswerOutputSchema,
      beforeExecute: enforceSubmitAnswerRateLimit,
      shouldCacheError: shouldCachePracticeSessionStateWriteError,
      execute: submitOnce,
    });
  },
});
