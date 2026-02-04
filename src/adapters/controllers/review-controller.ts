'use server';

import { z } from 'zod';
import { createDepsResolver, loadAppContainer } from '@/lib/controller-helpers';
import { MAX_PAGINATION_LIMIT } from '@/src/adapters/shared/validation-limits';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';
import type {
  AttemptRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import { createAction } from './create-action';
import type { CheckEntitlementUseCase } from './require-entitled-user-id';
import { requireEntitledUserId } from './require-entitled-user-id';

const GetMissedQuestionsInputSchema = z
  .object({
    limit: z.number().int().min(1).max(MAX_PAGINATION_LIMIT),
    offset: z.number().int().min(0),
  })
  .strict();

export type AvailableMissedQuestionRow = {
  isAvailable: true;
  questionId: string;
  slug: string;
  stemMd: string;
  difficulty: 'easy' | 'medium' | 'hard';
  lastAnsweredAt: string; // ISO
};

export type UnavailableMissedQuestionRow = {
  isAvailable: false;
  questionId: string;
  lastAnsweredAt: string; // ISO
};

export type MissedQuestionRow =
  | AvailableMissedQuestionRow
  | UnavailableMissedQuestionRow;

export type GetMissedQuestionsOutput = {
  rows: MissedQuestionRow[];
  limit: number;
  offset: number;
};

export type ReviewControllerDeps = {
  authGateway: AuthGateway;
  checkEntitlementUseCase: CheckEntitlementUseCase;
  attemptRepository: AttemptRepository;
  questionRepository: QuestionRepository;
  logger: Logger;
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

    const page = await d.attemptRepository.listMissedQuestionsByUserId(
      userId,
      input.limit,
      input.offset,
    );

    if (page.length === 0) {
      return { rows: [], limit: input.limit, offset: input.offset };
    }

    const questionIds = page.map((m) => m.questionId);
    const questions =
      await d.questionRepository.findPublishedByIds(questionIds);
    const byId = new Map(questions.map((q) => [q.id, q]));

    const rows: MissedQuestionRow[] = [];
    for (const m of page) {
      const question = byId.get(m.questionId);
      if (!question) {
        // Graceful degradation: questions can be unpublished/deleted while attempts persist.
        d.logger.warn(
          { questionId: m.questionId },
          'Missed question references missing question',
        );
        rows.push({
          isAvailable: false,
          questionId: m.questionId,
          lastAnsweredAt: m.answeredAt.toISOString(),
        });
        continue;
      }
      rows.push({
        isAvailable: true,
        questionId: question.id,
        slug: question.slug,
        stemMd: question.stemMd,
        difficulty: question.difficulty,
        lastAnsweredAt: m.answeredAt.toISOString(),
      });
    }

    return {
      rows,
      limit: input.limit,
      offset: input.offset,
    };
  },
});
