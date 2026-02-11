'use server';

import { z } from 'zod';
import { createDepsResolver, loadAppContainer } from '@/lib/controller-helpers';
import { MAX_PAGINATION_LIMIT } from '@/src/adapters/shared/validation-limits';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type {
  GetAttemptedQuestionsInput,
  GetAttemptedQuestionsOutput,
  GetMissedQuestionsInput,
  GetMissedQuestionsOutput,
} from '@/src/application/use-cases';
import { createAction } from './create-action';
import type { CheckEntitlementUseCase } from './require-entitled-user-id';
import { requireEntitledUserId } from './require-entitled-user-id';

const GetAttemptedQuestionsInputSchema = z
  .object({
    limit: z.number().int().min(1).max(MAX_PAGINATION_LIMIT),
    offset: z.number().int().min(0),
    result: z.enum(['correct', 'incorrect']).optional(),
    source: z.enum(['tutor', 'exam', 'adhoc']).optional(),
  })
  .strict();

const GetMissedQuestionsInputSchema = z
  .object({
    limit: z.number().int().min(1).max(MAX_PAGINATION_LIMIT),
    offset: z.number().int().min(0),
  })
  .strict();

export type {
  GetAttemptedQuestionsOutput,
  GetMissedQuestionsOutput,
  MissedQuestionRow,
} from '@/src/application/use-cases';

export type ReviewControllerDeps = {
  authGateway: AuthGateway;
  checkEntitlementUseCase: CheckEntitlementUseCase;
  getMissedQuestionsUseCase: {
    execute: (
      input: GetMissedQuestionsInput,
    ) => Promise<GetMissedQuestionsOutput>;
  };
  getAttemptedQuestionsUseCase: {
    execute: (
      input: GetAttemptedQuestionsInput,
    ) => Promise<GetAttemptedQuestionsOutput>;
  };
};

type ReviewControllerContainer = {
  createReviewControllerDeps: () => ReviewControllerDeps;
};

const getDeps = createDepsResolver<
  ReviewControllerDeps,
  ReviewControllerContainer
>((container) => container.createReviewControllerDeps(), loadAppContainer);

export const getAttemptedQuestions = createAction({
  schema: GetAttemptedQuestionsInputSchema,
  getDeps,
  execute: async (input, d) => {
    const userId = await requireEntitledUserId(d);
    return d.getAttemptedQuestionsUseCase.execute({
      userId,
      limit: input.limit,
      offset: input.offset,
      result: input.result ?? null,
      source: input.source ?? null,
    });
  },
});

export const getMissedQuestions = createAction({
  schema: GetMissedQuestionsInputSchema,
  getDeps,
  execute: async (input, d) => {
    const userId = await requireEntitledUserId(d);
    return d.getMissedQuestionsUseCase.execute({
      userId,
      limit: input.limit,
      offset: input.offset,
    });
  },
});
