'use server';

import { z } from 'zod';
import { createDepsResolver } from '@/lib/controller-helpers';
import {
  MAX_PRACTICE_SESSION_DIFFICULTY_FILTERS,
  MAX_PRACTICE_SESSION_TAG_FILTERS,
} from '@/src/adapters/repositories/practice-session-limits';
import { SUBMIT_ANSWER_RATE_LIMIT } from '@/src/adapters/shared/rate-limits';
import { MAX_TIME_SPENT_SECONDS } from '@/src/adapters/shared/validation-limits';
import { ApplicationError } from '@/src/application/errors';
import type {
  AuthGateway,
  RateLimiter,
} from '@/src/application/ports/gateways';
import type {
  GetNextQuestionInput,
  GetNextQuestionOutput,
} from '@/src/application/use-cases/get-next-question';
import type {
  SubmitAnswerInput,
  SubmitAnswerOutput,
} from '@/src/application/use-cases/submit-answer';
import type { ActionResult } from './action-result';
import { handleError, ok } from './action-result';
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
    timeSpentSeconds: z
      .number()
      .int()
      .min(0)
      .max(MAX_TIME_SPENT_SECONDS)
      .optional(),
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
  checkEntitlementUseCase: CheckEntitlementUseCase;
  getNextQuestionUseCase: GetNextQuestionUseCase;
  submitAnswerUseCase: SubmitAnswerUseCase;
};

const getDeps = createDepsResolver((container) =>
  container.createQuestionControllerDeps(),
);

export async function getNextQuestion(
  input: unknown,
  deps?: QuestionControllerDeps,
): Promise<ActionResult<GetNextQuestionOutput>> {
  const parsed = GetNextQuestionInputSchema.safeParse(input);
  if (!parsed.success) return handleError(parsed.error);

  try {
    const d = await getDeps(deps);
    const userIdOrError = await requireEntitledUserId(d);
    if (typeof userIdOrError !== 'string') return userIdOrError;
    const userId = userIdOrError;

    const data =
      typeof parsed.data.sessionId === 'string'
        ? await d.getNextQuestionUseCase.execute({
            userId,
            sessionId: parsed.data.sessionId,
          })
        : await d.getNextQuestionUseCase.execute({
            userId,
            filters: parsed.data.filters,
          });

    return ok(data);
  } catch (error) {
    return handleError(error);
  }
}

export async function submitAnswer(
  input: unknown,
  deps?: QuestionControllerDeps,
): Promise<ActionResult<SubmitAnswerOutput>> {
  const parsed = SubmitAnswerInputSchema.safeParse(input);
  if (!parsed.success) return handleError(parsed.error);

  try {
    const d = await getDeps(deps);
    const userIdOrError = await requireEntitledUserId(d);
    if (typeof userIdOrError !== 'string') return userIdOrError;
    const userId = userIdOrError;

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

    const data = await d.submitAnswerUseCase.execute({
      userId,
      questionId: parsed.data.questionId,
      choiceId: parsed.data.choiceId,
      sessionId: parsed.data.sessionId,
      timeSpentSeconds: parsed.data.timeSpentSeconds,
    });

    return ok(data);
  } catch (error) {
    return handleError(error);
  }
}
