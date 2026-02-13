'use server';

import { z } from 'zod';
import { createDepsResolver, loadAppContainer } from '@/lib/controller-helpers';
import { zUuid } from '@/src/adapters/shared/zod-schemas';
import { ApplicationError } from '@/src/application/errors';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type { QuestionRepository } from '@/src/application/ports/repositories';
import { buildShuffledChoiceViews } from '@/src/application/shared/shuffled-choice-views';
import type {
  GetPreviousAttemptInput,
  GetPreviousAttemptOutput,
} from '@/src/application/use-cases';
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
  getPreviousAttemptUseCase: {
    execute: (
      input: GetPreviousAttemptInput,
    ) => Promise<GetPreviousAttemptOutput | null>;
  };
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
    const userId = await requireEntitledUserId(d);

    const question = await d.questionRepository.findPublishedBySlug(input.slug);
    if (!question) {
      throw new ApplicationError('NOT_FOUND', 'Question not found');
    }

    return {
      questionId: question.id,
      slug: question.slug,
      stemMd: question.stemMd,
      difficulty: question.difficulty,
      choices: buildShuffledChoiceViews(question, userId).map((choice) => ({
        id: choice.choiceId,
        label: choice.displayLabel,
        textMd: choice.textMd,
      })),
    };
  },
});

const GetPreviousAttemptInputSchema = z
  .object({
    questionId: z.string().min(1),
    attemptId: zUuid.optional(),
    sessionId: zUuid.optional(),
  })
  .strict();

export const getPreviousAttempt = createAction({
  schema: GetPreviousAttemptInputSchema,
  getDeps,
  execute: async (input, d) => {
    const userId = await requireEntitledUserId(d);
    return d.getPreviousAttemptUseCase.execute({
      userId,
      questionId: input.questionId,
      ...(input.attemptId ? { attemptId: input.attemptId } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    });
  },
});
