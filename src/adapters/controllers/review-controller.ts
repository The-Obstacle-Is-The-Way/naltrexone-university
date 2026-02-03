'use server';

import { z } from 'zod';
import {
  createDepsResolver,
  type LoadContainerFn,
  loadAppContainer,
} from '@/lib/controller-helpers';
import type { Logger } from '@/src/adapters/shared/logger';
import { MAX_PAGINATION_LIMIT } from '@/src/adapters/shared/validation-limits';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type {
  AttemptRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import type { ActionResult } from './action-result';
import { handleError, ok } from './action-result';
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

export async function getMissedQuestions(
  input: unknown,
  deps?: ReviewControllerDeps,
  options?: { loadContainer?: LoadContainerFn<ReviewControllerContainer> },
): Promise<ActionResult<GetMissedQuestionsOutput>> {
  const parsed = GetMissedQuestionsInputSchema.safeParse(input);
  if (!parsed.success) return handleError(parsed.error);

  try {
    const d = await getDeps(deps, options);
    const userId = await requireEntitledUserId(d);

    const page = await d.attemptRepository.listMissedQuestionsByUserId(
      userId,
      parsed.data.limit,
      parsed.data.offset,
    );

    if (page.length === 0) {
      return ok({
        rows: [],
        limit: parsed.data.limit,
        offset: parsed.data.offset,
      });
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

    return ok({
      rows,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });
  } catch (error) {
    return handleError(error);
  }
}
