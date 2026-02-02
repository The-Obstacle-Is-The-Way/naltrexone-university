'use server';

import { z } from 'zod';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type { QuestionRepository } from '@/src/application/ports/repositories';
import type {
  CheckEntitlementInput,
  CheckEntitlementOutput,
} from '@/src/application/use-cases/check-entitlement';
import type { ActionResult } from './action-result';
import { err, handleError, ok } from './action-result';

const MAX_SLUG_LENGTH = 255;

const GetQuestionBySlugInputSchema = z
  .object({
    slug: z.string().min(1).max(MAX_SLUG_LENGTH),
  })
  .strict();

export type GetQuestionBySlugOutput = {
  questionId: string;
  slug: string;
  stemMd: string;
  difficulty: 'easy' | 'medium' | 'hard';
  choices: Array<{
    id: string;
    label: string;
    textMd: string;
  }>;
};

type CheckEntitlementUseCase = {
  execute: (input: CheckEntitlementInput) => Promise<CheckEntitlementOutput>;
};

export type QuestionViewControllerDeps = {
  authGateway: AuthGateway;
  checkEntitlementUseCase: CheckEntitlementUseCase;
  questionRepository: QuestionRepository;
};

async function getDeps(
  deps?: QuestionViewControllerDeps,
): Promise<QuestionViewControllerDeps> {
  if (deps) return deps;

  const { createContainer } = await import('@/lib/container');
  return createContainer().createQuestionViewControllerDeps();
}

async function requireEntitledUserId(
  deps: QuestionViewControllerDeps,
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

export async function getQuestionBySlug(
  input: unknown,
  deps?: QuestionViewControllerDeps,
): Promise<ActionResult<GetQuestionBySlugOutput>> {
  const parsed = GetQuestionBySlugInputSchema.safeParse(input);
  if (!parsed.success) return handleError(parsed.error);

  try {
    const d = await getDeps(deps);
    const userIdOrError = await requireEntitledUserId(d);
    if (typeof userIdOrError !== 'string') return userIdOrError;

    const question = await d.questionRepository.findPublishedBySlug(
      parsed.data.slug,
    );
    if (!question) {
      return err('NOT_FOUND', 'Question not found');
    }

    return ok({
      questionId: question.id,
      slug: question.slug,
      stemMd: question.stemMd,
      difficulty: question.difficulty,
      choices: question.choices.map((choice) => ({
        id: choice.id,
        label: choice.label,
        textMd: choice.textMd,
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}
