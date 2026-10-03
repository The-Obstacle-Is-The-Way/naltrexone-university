'use server';

import { z } from 'zod';
import { createDepsResolver, loadAppContainer } from '@/lib/controller-helpers';
import { zUuid } from '@/src/adapters/shared/zod-schemas';
import { ApplicationError } from '@/src/application/errors';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';
import { buildShuffledChoiceViews } from '@/src/application/shared/shuffled-choice-views';
import type {
  GetPreviousAttemptInput,
  GetPreviousAttemptOutput,
  GetQuestionForViewInput,
  GetQuestionForViewOutput,
} from '@/src/application/use-cases';
import type {
  QuestionAvailability,
  QuestionDifficulty,
} from '@/src/domain/value-objects';
import { createAction } from './create-action';
import type { CheckEntitlementUseCase } from './require-entitled-user-id';
import { requireEntitledUserId } from './require-entitled-user-id';

const MAX_SLUG_LENGTH = 255;

const GetQuestionBySlugInputSchema = z
  .object({
    slug: z.string().min(1).max(MAX_SLUG_LENGTH),
    // A review of the learner's own answer: its attempt or session, or neither
    // for their latest attempt (ADR-021 §3).
    review: z
      .object({
        attemptId: zUuid.optional(),
        sessionId: zUuid.optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.review?.attemptId && input.review.sessionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['review', 'attemptId'],
        message: 'Provide either attemptId or sessionId, not both',
      });
    }
  });

export type GetQuestionBySlugOutput = {
  questionId: string;
  slug: string;
  stemMd: string;
  difficulty: QuestionDifficulty;
  choices: Array<{
    id: string;
    label: string;
    textMd: string;
  }>;
  /**
   * What the learner is told about the question now: a question no longer
   * published shows its label and notice (ADR-022, Pattern Registry F-11).
   */
  availability: QuestionAvailability;
  /** Updated since the learner saw it (Pattern Registry F-12). */
  superseded: boolean;
};

export type QuestionViewControllerDeps = {
  authGateway: AuthGateway;
  logger: Logger;
  checkEntitlementUseCase: CheckEntitlementUseCase;
  getQuestionForViewUseCase: {
    execute: (
      input: GetQuestionForViewInput,
    ) => Promise<GetQuestionForViewOutput>;
  };
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

function safeLog(
  logger: Logger,
  level: 'info' | 'warn',
  context: Record<string, unknown>,
  msg: string,
): void {
  try {
    logger[level](context, msg);
  } catch {
    // Telemetry must not change request outcomes.
  }
}

export const getQuestionBySlug = createAction({
  schema: GetQuestionBySlugInputSchema,
  getDeps,
  execute: async (input, d, meta) => {
    const userId = await requireEntitledUserId(d, meta);

    const view = await d.getQuestionForViewUseCase.execute({
      userId,
      slug: input.slug,
      ...(input.review
        ? {
            review: {
              ...(input.review.attemptId
                ? { attemptId: input.review.attemptId }
                : {}),
              ...(input.review.sessionId
                ? { sessionId: input.review.sessionId }
                : {}),
            },
          }
        : {}),
    });
    if (!view) {
      throw new ApplicationError('NOT_FOUND', 'Question not found');
    }
    const { question } = view;

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
      availability: question.availability,
      superseded: view.superseded,
    };
  },
});

const GetPreviousAttemptInputSchema = z
  .object({
    questionId: zUuid,
    attemptId: zUuid.optional(),
    sessionId: zUuid.optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.attemptId && input.sessionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['attemptId'],
        message: 'Provide either attemptId or sessionId, not both',
      });
    }
  });

export const getPreviousAttempt = createAction({
  schema: GetPreviousAttemptInputSchema,
  getDeps,
  execute: async (input, d, meta) => {
    const userId = await requireEntitledUserId(d, meta);
    try {
      const output = await d.getPreviousAttemptUseCase.execute({
        userId,
        questionId: input.questionId,
        ...(input.attemptId ? { attemptId: input.attemptId } : {}),
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      });
      const outcome = output ? output.kind : 'no_prior_attempt';

      safeLog(
        d.logger,
        'info',
        {
          event: 'review_hydration_outcome',
          mode: 'review',
          outcome,
          hasAttemptId: Boolean(input.attemptId),
          hasSessionId: Boolean(input.sessionId),
          questionId: input.questionId,
          userId,
        },
        'Review hydration outcome',
      );

      return output;
    } catch (error) {
      safeLog(
        d.logger,
        'warn',
        {
          event: 'review_hydration_outcome',
          mode: 'review',
          outcome: 'hydration_error',
          hasAttemptId: Boolean(input.attemptId),
          hasSessionId: Boolean(input.sessionId),
          questionId: input.questionId,
          userId,
          errorCode:
            error instanceof ApplicationError ? error.code : 'INTERNAL_ERROR',
        },
        'Review hydration outcome',
      );
      throw error;
    }
  },
});
