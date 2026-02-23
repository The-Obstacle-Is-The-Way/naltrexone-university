'use server';

import { z } from 'zod';
import { createDepsResolver, loadAppContainer } from '@/lib/controller-helpers';
import { MAX_PAGINATION_LIMIT } from '@/src/adapters/shared/validation-limits';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type {
  GetAttemptedQuestionsInput,
  GetAttemptedQuestionsOutput,
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
    difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
    tagSlug: z.string().min(1).optional(),
    sort: z
      .enum(['recent', 'incorrect-first', 'correct-first', 'difficulty'])
      .optional(),
  })
  .strict();

export type {
  AttemptedQuestionRow,
  GetAttemptedQuestionsOutput,
} from '@/src/application/use-cases';

export type ReviewControllerDeps = {
  authGateway: AuthGateway;
  checkEntitlementUseCase: CheckEntitlementUseCase;
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
      difficulty: input.difficulty ?? null,
      tagSlug: input.tagSlug ?? null,
      sort: input.sort ?? null,
    });
  },
});
