'use server';

import { z } from 'zod';
import { createDepsResolver } from '@/lib/controller-helpers';
import {
  MAX_PRACTICE_SESSION_DIFFICULTY_FILTERS,
  MAX_PRACTICE_SESSION_QUESTIONS,
  MAX_PRACTICE_SESSION_TAG_FILTERS,
} from '@/src/adapters/repositories/practice-session-limits';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type {
  AttemptRepository,
  PracticeSessionRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import type {
  CheckEntitlementInput,
  CheckEntitlementOutput,
} from '@/src/application/use-cases/check-entitlement';
import {
  computeAccuracy,
  createSeed,
  shuffleWithSeed,
} from '@/src/domain/services';
import type { ActionResult } from './action-result';
import { err, handleError, ok } from './action-result';

const zUuid = z.string().uuid();

const zDifficulty = z.enum(['easy', 'medium', 'hard']);

const zPracticeMode = z.enum(['tutor', 'exam']);

const StartPracticeSessionInputSchema = z
  .object({
    mode: zPracticeMode,
    count: z.number().int().min(1).max(MAX_PRACTICE_SESSION_QUESTIONS),
    tagSlugs: z
      .array(z.string().min(1))
      .max(MAX_PRACTICE_SESSION_TAG_FILTERS)
      .default([]),
    difficulties: z
      .array(zDifficulty)
      .max(MAX_PRACTICE_SESSION_DIFFICULTY_FILTERS)
      .default([]),
  })
  .strict();

const EndPracticeSessionInputSchema = z
  .object({
    sessionId: zUuid,
  })
  .strict();

type CheckEntitlementUseCase = {
  execute: (input: CheckEntitlementInput) => Promise<CheckEntitlementOutput>;
};

export type StartPracticeSessionOutput = { sessionId: string };

export type EndPracticeSessionOutput = {
  sessionId: string;
  endedAt: string; // ISO
  totals: {
    answered: number;
    correct: number;
    accuracy: number; // 0..1
    durationSeconds: number;
  };
};

export type PracticeControllerDeps = {
  authGateway: AuthGateway;
  checkEntitlementUseCase: CheckEntitlementUseCase;
  questionRepository: QuestionRepository;
  practiceSessionRepository: PracticeSessionRepository;
  attemptRepository: AttemptRepository;
  now: () => Date;
};

const getDeps = createDepsResolver((container) =>
  container.createPracticeControllerDeps(),
);

async function requireEntitledUserId(
  deps: PracticeControllerDeps,
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

export async function startPracticeSession(
  input: unknown,
  deps?: PracticeControllerDeps,
): Promise<ActionResult<StartPracticeSessionOutput>> {
  const parsed = StartPracticeSessionInputSchema.safeParse(input);
  if (!parsed.success) return handleError(parsed.error);

  try {
    const d = await getDeps(deps);
    const userIdOrError = await requireEntitledUserId(d);
    if (typeof userIdOrError !== 'string') return userIdOrError;
    const userId = userIdOrError;

    const candidateIds = await d.questionRepository.listPublishedCandidateIds({
      tagSlugs: parsed.data.tagSlugs,
      difficulties: parsed.data.difficulties,
    });
    if (candidateIds.length === 0) {
      return err('NOT_FOUND', 'No questions found');
    }

    const seed = createSeed(userId, d.now().getTime());
    const questionIds = shuffleWithSeed(candidateIds, seed).slice(
      0,
      parsed.data.count,
    );

    const session = await d.practiceSessionRepository.create({
      userId,
      mode: parsed.data.mode,
      paramsJson: {
        count: parsed.data.count,
        tagSlugs: parsed.data.tagSlugs,
        difficulties: parsed.data.difficulties,
        questionIds,
      },
    });

    return ok({ sessionId: session.id });
  } catch (error) {
    return handleError(error);
  }
}

export async function endPracticeSession(
  input: unknown,
  deps?: PracticeControllerDeps,
): Promise<ActionResult<EndPracticeSessionOutput>> {
  const parsed = EndPracticeSessionInputSchema.safeParse(input);
  if (!parsed.success) return handleError(parsed.error);

  try {
    const d = await getDeps(deps);
    const userIdOrError = await requireEntitledUserId(d);
    if (typeof userIdOrError !== 'string') return userIdOrError;
    const userId = userIdOrError;

    const session = await d.practiceSessionRepository.end(
      parsed.data.sessionId,
      userId,
    );

    const endedAt = session.endedAt;
    if (!endedAt) {
      return err('INTERNAL_ERROR', 'Practice session did not end');
    }

    const attempts = await d.attemptRepository.findBySessionId(
      session.id,
      userId,
    );

    const answered = attempts.length;
    const correct = attempts.filter((a) => a.isCorrect).length;
    const accuracy = computeAccuracy(answered, correct);

    const durationSeconds = Math.max(
      0,
      Math.floor((endedAt.getTime() - session.startedAt.getTime()) / 1000),
    );

    return ok({
      sessionId: session.id,
      endedAt: endedAt.toISOString(),
      totals: {
        answered,
        correct,
        accuracy,
        durationSeconds,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
