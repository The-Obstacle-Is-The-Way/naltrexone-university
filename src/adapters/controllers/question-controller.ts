'use server';

import { z } from 'zod';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type {
  CheckEntitlementInput,
  CheckEntitlementOutput,
} from '@/src/application/use-cases/check-entitlement';
import type {
  GetNextQuestionInput,
  GetNextQuestionOutput,
} from '@/src/application/use-cases/get-next-question';
import type {
  SubmitAnswerInput,
  SubmitAnswerOutput,
} from '@/src/application/use-cases/submit-answer';
import type { ActionResult } from './action-result';
import { err, handleError, ok } from './action-result';

const zUuid = z.string().uuid();

const zDifficulty = z.enum(['easy', 'medium', 'hard']);

const QuestionFiltersSchema = z
  .object({
    tagSlugs: z.array(z.string().min(1)).max(50).default([]),
    difficulties: z.array(zDifficulty).max(3).default([]),
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
  })
  .strict();

type CheckEntitlementUseCase = {
  execute: (input: CheckEntitlementInput) => Promise<CheckEntitlementOutput>;
};

type GetNextQuestionUseCase = {
  execute: (input: GetNextQuestionInput) => Promise<GetNextQuestionOutput>;
};

type SubmitAnswerUseCase = {
  execute: (input: SubmitAnswerInput) => Promise<SubmitAnswerOutput>;
};

export type QuestionControllerDeps = {
  authGateway: AuthGateway;
  checkEntitlementUseCase: CheckEntitlementUseCase;
  getNextQuestionUseCase: GetNextQuestionUseCase;
  submitAnswerUseCase: SubmitAnswerUseCase;
};

async function getDeps(
  deps?: QuestionControllerDeps,
): Promise<QuestionControllerDeps> {
  if (deps) return deps;

  const { createContainer } = await import('@/lib/container');
  return createContainer().createQuestionControllerDeps();
}

async function requireEntitledUserId(
  deps: QuestionControllerDeps,
): Promise<string | ActionResult<never>> {
  const user = await deps.authGateway.requireUser();
  const entitlement = await deps.checkEntitlementUseCase.execute({
    userId: user.id,
  });

  if (!entitlement.isEntitled) {
    return err('UNSUBSCRIBED', 'Subscription required');
  }

  return user.id;
}

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

    const data = await d.submitAnswerUseCase.execute({
      userId,
      questionId: parsed.data.questionId,
      choiceId: parsed.data.choiceId,
      sessionId: parsed.data.sessionId,
    });

    return ok(data);
  } catch (error) {
    return handleError(error);
  }
}
