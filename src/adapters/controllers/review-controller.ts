'use server';

import { z } from 'zod';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type {
  AttemptRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import type {
  CheckEntitlementInput,
  CheckEntitlementOutput,
} from '@/src/application/use-cases/check-entitlement';
import type { ActionResult } from './action-result';
import { err, handleError, ok } from './action-result';

const GetMissedQuestionsInputSchema = z
  .object({
    limit: z.number().int().min(1).max(100),
    offset: z.number().int().min(0),
  })
  .strict();

type CheckEntitlementUseCase = {
  execute: (input: CheckEntitlementInput) => Promise<CheckEntitlementOutput>;
};

type Logger = {
  warn: (msg: string, context?: Record<string, unknown>) => void;
};

export type MissedQuestionRow = {
  questionId: string;
  slug: string;
  stemMd: string;
  difficulty: 'easy' | 'medium' | 'hard';
  lastAnsweredAt: string; // ISO
};

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
  logger?: Logger;
};

async function getDeps(
  deps?: ReviewControllerDeps,
): Promise<ReviewControllerDeps> {
  if (deps) return deps;

  const { createContainer } = await import('@/lib/container');
  return createContainer().createReviewControllerDeps();
}

async function requireEntitledUserId(
  deps: ReviewControllerDeps,
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

export async function getMissedQuestions(
  input: unknown,
  deps?: ReviewControllerDeps,
): Promise<ActionResult<GetMissedQuestionsOutput>> {
  const parsed = GetMissedQuestionsInputSchema.safeParse(input);
  if (!parsed.success) return handleError(parsed.error);

  try {
    const d = await getDeps(deps);
    const userIdOrError = await requireEntitledUserId(d);
    if (typeof userIdOrError !== 'string') return userIdOrError;
    const userId = userIdOrError;

    const page = await d.attemptRepository.listMissedQuestionsByUserId(
      userId,
      parsed.data.limit,
      parsed.data.offset,
    );

    const questionIds = page.map((m) => m.questionId);
    const questions =
      await d.questionRepository.findPublishedByIds(questionIds);
    const byId = new Map(questions.map((q) => [q.id, q]));

    const rows: MissedQuestionRow[] = [];
    for (const m of page) {
      const question = byId.get(m.questionId);
      if (!question) {
        d.logger?.warn('Missed question references missing question', {
          questionId: m.questionId,
        });
        continue;
      }
      rows.push({
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
