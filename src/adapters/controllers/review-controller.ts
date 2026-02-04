'use server';

import { z } from 'zod';
import { createDepsResolver, loadAppContainer } from '@/lib/controller-helpers';
import { MAX_PAGINATION_LIMIT } from '@/src/adapters/shared/validation-limits';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type {
  GetMissedQuestionsInput,
  GetMissedQuestionsOutput,
} from '@/src/application/use-cases';
import { createAction } from './create-action';
import type { CheckEntitlementUseCase } from './require-entitled-user-id';
import { requireEntitledUserId } from './require-entitled-user-id';

const GetMissedQuestionsInputSchema = z
  .object({
    limit: z.number().int().min(1).max(MAX_PAGINATION_LIMIT),
    offset: z.number().int().min(0),
  })
  .strict();

export type {
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
};

type ReviewControllerContainer = {
  createReviewControllerDeps: () => ReviewControllerDeps;
};

const getDeps = createDepsResolver<
  ReviewControllerDeps,
  ReviewControllerContainer
>((container) => container.createReviewControllerDeps(), loadAppContainer);

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
