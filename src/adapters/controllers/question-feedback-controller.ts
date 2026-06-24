'use server';

import { z } from 'zod';
import { createDepsResolver, loadAppContainer } from '@/lib/controller-helpers';
import {
  QUESTION_RATING_RATE_LIMIT,
  QUESTION_REPORT_RATE_LIMIT,
} from '@/src/adapters/shared/rate-limits';
import { MAX_QUESTION_FEEDBACK_COMMENT_LENGTH } from '@/src/adapters/shared/validation-limits';
import { zUuid } from '@/src/adapters/shared/zod-schemas';
import { ApplicationError } from '@/src/application/errors';
import type {
  AuthGateway,
  RateLimiter,
} from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';
import type { IdempotencyKeyRepository } from '@/src/application/ports/repositories';
import type {
  GetQuestionRatingInput,
  GetQuestionRatingOutput,
  RateQuestionInput,
  RateQuestionOutput,
  SubmitQuestionReportInput,
  SubmitQuestionReportOutput,
} from '@/src/application/use-cases';
import {
  AllQuestionFeedbackCategories,
  AllQuestionFeedbackRatings,
} from '@/src/domain/value-objects';
import { createAction } from './create-action';
import type { CheckEntitlementUseCase } from './require-entitled-user-id';
import { requireEntitledUserId } from './require-entitled-user-id';
import { executeIdempotent } from './shared/execute-idempotent';

const zRating = z.enum(AllQuestionFeedbackRatings);
const zCategory = z.enum(AllQuestionFeedbackCategories);
const zOptionalComment = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim().length === 0 ? undefined : value,
  z.string().trim().min(1).max(MAX_QUESTION_FEEDBACK_COMMENT_LENGTH).optional(),
);

const RateQuestionInputSchema = z
  .object({
    questionId: zUuid,
    attemptId: zUuid.nullish(),
    practiceSessionId: zUuid.nullish(),
    rating: zRating.nullable(),
    idempotencyKey: zUuid.optional(),
  })
  .strict();

const GetQuestionRatingInputSchema = z
  .object({
    questionId: zUuid,
  })
  .strict();

const SubmitQuestionReportInputSchema = z
  .object({
    questionId: zUuid,
    attemptId: zUuid.nullish(),
    practiceSessionId: zUuid.nullish(),
    category: zCategory,
    comment: zOptionalComment,
    idempotencyKey: zUuid.optional(),
  })
  .strict();

const RateQuestionOutputSchema = z
  .object({
    rating: zRating.nullable(),
  })
  .strict();

const GetQuestionRatingOutputSchema = RateQuestionOutputSchema;

const SubmitQuestionReportOutputSchema = z
  .object({
    feedbackId: zUuid,
  })
  .strict();

export type {
  GetQuestionRatingOutput,
  RateQuestionOutput,
  SubmitQuestionReportOutput,
} from '@/src/application/use-cases';

export type QuestionFeedbackControllerDeps = {
  authGateway: AuthGateway;
  logger: Logger;
  rateLimiter: RateLimiter;
  idempotencyKeyRepository: IdempotencyKeyRepository;
  checkEntitlementUseCase: CheckEntitlementUseCase;
  rateQuestionUseCase: {
    execute: (input: RateQuestionInput) => Promise<RateQuestionOutput>;
  };
  getQuestionRatingUseCase: {
    execute: (
      input: GetQuestionRatingInput,
    ) => Promise<GetQuestionRatingOutput>;
  };
  submitQuestionReportUseCase: {
    execute: (
      input: SubmitQuestionReportInput,
    ) => Promise<SubmitQuestionReportOutput>;
  };
  now: () => Date;
};

type QuestionFeedbackControllerContainer = {
  createQuestionFeedbackControllerDeps: () => QuestionFeedbackControllerDeps;
};

const getDeps = createDepsResolver<
  QuestionFeedbackControllerDeps,
  QuestionFeedbackControllerContainer
>(
  (container) => container.createQuestionFeedbackControllerDeps(),
  loadAppContainer,
);

export const rateQuestion = createAction({
  schema: RateQuestionInputSchema,
  getDeps,
  execute: async (input, d, meta) => {
    const userId = await requireEntitledUserId(d, meta);
    const { idempotencyKey } = input;

    const rateLimit = await d.rateLimiter.limit({
      key: `question-feedback:rateQuestion:${userId}`,
      ...QUESTION_RATING_RATE_LIMIT,
    });
    if (!rateLimit.success) {
      throw new ApplicationError(
        'RATE_LIMITED',
        `Too many question ratings. Try again in ${rateLimit.retryAfterSeconds}s.`,
      );
    }

    async function rate(): Promise<RateQuestionOutput> {
      return d.rateQuestionUseCase.execute({
        userId,
        questionId: input.questionId,
        attemptId: input.attemptId ?? null,
        practiceSessionId: input.practiceSessionId ?? null,
        rating: input.rating,
      });
    }

    return executeIdempotent({
      d,
      userId,
      action: 'question-feedback:rateQuestion',
      idempotencyKey,
      outputSchema: RateQuestionOutputSchema,
      execute: rate,
    });
  },
});

export const getQuestionRating = createAction({
  schema: GetQuestionRatingInputSchema,
  getDeps,
  execute: async (input, d, meta) => {
    const userId = await requireEntitledUserId(d, meta);
    const output = await d.getQuestionRatingUseCase.execute({
      userId,
      questionId: input.questionId,
    });
    return GetQuestionRatingOutputSchema.parse(output);
  },
});

export const submitQuestionReport = createAction({
  schema: SubmitQuestionReportInputSchema,
  getDeps,
  execute: async (input, d, meta) => {
    const userId = await requireEntitledUserId(d, meta);
    const { idempotencyKey } = input;

    const rateLimit = await d.rateLimiter.limit({
      key: `question-feedback:submitQuestionReport:${userId}`,
      ...QUESTION_REPORT_RATE_LIMIT,
    });
    if (!rateLimit.success) {
      throw new ApplicationError(
        'RATE_LIMITED',
        `Too many question reports. Try again in ${rateLimit.retryAfterSeconds}s.`,
      );
    }

    async function submit(): Promise<SubmitQuestionReportOutput> {
      return d.submitQuestionReportUseCase.execute({
        userId,
        questionId: input.questionId,
        attemptId: input.attemptId ?? null,
        practiceSessionId: input.practiceSessionId ?? null,
        category: input.category,
        comment: input.comment ?? null,
      });
    }

    return executeIdempotent({
      d,
      userId,
      action: 'question-feedback:submitQuestionReport',
      idempotencyKey,
      outputSchema: SubmitQuestionReportOutputSchema,
      execute: submit,
    });
  },
});
