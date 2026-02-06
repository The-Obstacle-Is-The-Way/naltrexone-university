'use server';

import { z } from 'zod';
import { createDepsResolver, loadAppContainer } from '@/lib/controller-helpers';
import { SUBMIT_ANSWER_RATE_LIMIT } from '@/src/adapters/shared/rate-limits';
import {
  MAX_PRACTICE_SESSION_DIFFICULTY_FILTERS,
  MAX_PRACTICE_SESSION_TAG_FILTERS,
  MAX_TIME_SPENT_SECONDS,
} from '@/src/adapters/shared/validation-limits';
import { withIdempotency } from '@/src/adapters/shared/with-idempotency';
import { ApplicationError } from '@/src/application/errors';
import type {
  AuthGateway,
  RateLimiter,
} from '@/src/application/ports/gateways';
import type { IdempotencyKeyRepository } from '@/src/application/ports/repositories';
import type {
  GetNextQuestionInput,
  GetNextQuestionOutput,
} from '@/src/application/use-cases/get-next-question';
import type {
  SubmitAnswerInput,
  SubmitAnswerOutput,
} from '@/src/application/use-cases/submit-answer';
import { createAction } from './create-action';
import type { CheckEntitlementUseCase } from './require-entitled-user-id';
import { requireEntitledUserId } from './require-entitled-user-id';

const zUuid = z.string().uuid();

const zDifficulty = z.enum(['easy', 'medium', 'hard']);

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
  })
  .strict();

const GetNextQuestionInputSchema = z.union([
  z
    .object({
      sessionId: zUuid,
      filters: z.undefined().optional(),
    })
    .strict(),
  z
    .object({
      sessionId: z.undefined().optional(),
      filters: QuestionFiltersSchema,
    })
    .strict(),
]);

const SubmitAnswerInputSchema = z
  .object({
    questionId: zUuid,
    choiceId: zUuid,
    sessionId: zUuid.optional(),
    idempotencyKey: zUuid.optional(),
    timeSpentSeconds: z
      .number()
      .int()
      .min(0)
      .max(MAX_TIME_SPENT_SECONDS)
      .optional(),
  })
  .strict();

const SubmitAnswerOutputSchema = z
  .object({
    attemptId: zUuid,
    isCorrect: z.boolean(),
    correctChoiceId: zUuid,
    explanationMd: z.string().nullable(),
    choiceExplanations: z.array(
      z
        .object({
          choiceId: zUuid,
          displayLabel: z.enum(['A', 'B', 'C', 'D', 'E']),
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
  rateLimiter: RateLimiter;
  idempotencyKeyRepository: IdempotencyKeyRepository;
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
  execute: async (input, d) => {
    const userId = await requireEntitledUserId(d);

    if (typeof input.sessionId === 'string') {
      return d.getNextQuestionUseCase.execute({
        userId,
        sessionId: input.sessionId,
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
  execute: async (input, d) => {
    const userId = await requireEntitledUserId(d);

    const {
      questionId,
      choiceId,
      sessionId,
      idempotencyKey,
      timeSpentSeconds,
    } = input;

    async function submitOnce(): Promise<SubmitAnswerOutput> {
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

      return d.submitAnswerUseCase.execute({
        userId,
        questionId,
        choiceId,
        sessionId,
        timeSpentSeconds,
      });
    }

    if (!idempotencyKey) {
      return submitOnce();
    }

    return withIdempotency({
      repo: d.idempotencyKeyRepository,
      userId,
      action: 'question:submitAnswer',
      key: idempotencyKey,
      now: () => new Date(),
      parseResult: (value) => SubmitAnswerOutputSchema.parse(value),
      execute: submitOnce,
    });
  },
});
