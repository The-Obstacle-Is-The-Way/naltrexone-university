'use server';

import { z } from 'zod';
import { createDepsResolver, loadAppContainer } from '@/lib/controller-helpers';
import { ApplicationError } from '@/src/application/errors';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type { QuestionRepository } from '@/src/application/ports/repositories';
import { createAction } from './create-action';
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

export const getQuestionBySlug = createAction({
  schema: GetQuestionBySlugInputSchema,
  getDeps,
  execute: async (input, d) => {
    await requireEntitledUserId(d);

    const question = await d.questionRepository.findPublishedBySlug(input.slug);
    if (!question) {
      throw new ApplicationError('NOT_FOUND', 'Question not found');
    }

    return {
      questionId: question.id,
      slug: question.slug,
      stemMd: question.stemMd,
      difficulty: question.difficulty,
      choices: question.choices.map((choice) => ({
        id: choice.id,
        label: choice.label,
        textMd: choice.textMd,
      })),
    };
  },
});
