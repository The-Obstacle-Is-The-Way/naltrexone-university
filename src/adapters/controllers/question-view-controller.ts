'use server';

import { z } from 'zod';
import {
  createDepsResolver,
  type LoadContainerFn,
  loadAppContainer,
} from '@/lib/controller-helpers';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type { QuestionRepository } from '@/src/application/ports/repositories';
import type { ActionResult } from './action-result';
import { err, handleError, ok } from './action-result';
import type { CheckEntitlementUseCase } from './require-entitled-user-id';
import { requireEntitledUserId } from './require-entitled-user-id';

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

export type QuestionViewControllerDeps = {
  authGateway: AuthGateway;
  checkEntitlementUseCase: CheckEntitlementUseCase;
  questionRepository: QuestionRepository;
};

type QuestionViewControllerContainer = {
  createQuestionViewControllerDeps: () => QuestionViewControllerDeps;
};

const getDeps = createDepsResolver<
  QuestionViewControllerDeps,
  QuestionViewControllerContainer
>(
  (container) => container.createQuestionViewControllerDeps(),
  loadAppContainer,
);

export async function getQuestionBySlug(
  input: unknown,
  deps?: QuestionViewControllerDeps,
  options?: {
    loadContainer?: LoadContainerFn<QuestionViewControllerContainer>;
  },
): Promise<ActionResult<GetQuestionBySlugOutput>> {
  const parsed = GetQuestionBySlugInputSchema.safeParse(input);
  if (!parsed.success) return handleError(parsed.error);

  try {
    const d = await getDeps(deps, options);
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
