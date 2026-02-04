'use server';

import { z } from 'zod';
import { createDepsResolver, loadAppContainer } from '@/lib/controller-helpers';
import { START_PRACTICE_SESSION_RATE_LIMIT } from '@/src/adapters/shared/rate-limits';
import {
  MAX_PRACTICE_SESSION_DIFFICULTY_FILTERS,
  MAX_PRACTICE_SESSION_QUESTIONS,
  MAX_PRACTICE_SESSION_TAG_FILTERS,
} from '@/src/adapters/shared/validation-limits';
import { withIdempotency } from '@/src/adapters/shared/with-idempotency';
import { ApplicationError } from '@/src/application/errors';
import type {
  AuthGateway,
  RateLimiter,
} from '@/src/application/ports/gateways';
import type {
  AttemptRepository,
  IdempotencyKeyRepository,
  PracticeSessionRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import {
  computeAccuracy,
  createSeed,
  shuffleWithSeed,
} from '@/src/domain/services';
import { createAction } from './create-action';
import type { CheckEntitlementUseCase } from './require-entitled-user-id';
import { requireEntitledUserId } from './require-entitled-user-id';

const zUuid = z.string().uuid();

const zDifficulty = z.enum(['easy', 'medium', 'hard']);

const zPracticeMode = z.enum(['tutor', 'exam']);

const StartPracticeSessionInputSchema = z
  .object({
    mode: zPracticeMode,
    count: z.number().int().min(1).max(MAX_PRACTICE_SESSION_QUESTIONS),
    idempotencyKey: zUuid.optional(),
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
  rateLimiter: RateLimiter;
  idempotencyKeyRepository: IdempotencyKeyRepository;
  checkEntitlementUseCase: CheckEntitlementUseCase;
  questionRepository: QuestionRepository;
  practiceSessionRepository: PracticeSessionRepository;
  attemptRepository: AttemptRepository;
  now: () => Date;
};

type PracticeControllerContainer = {
  createPracticeControllerDeps: () => PracticeControllerDeps;
};

const getDeps = createDepsResolver<
  PracticeControllerDeps,
  PracticeControllerContainer
>((container) => container.createPracticeControllerDeps(), loadAppContainer);

export const startPracticeSession = createAction({
  schema: StartPracticeSessionInputSchema,
  getDeps,
  execute: async (input, d) => {
    const userId = await requireEntitledUserId(d);

    const { mode, count, tagSlugs, difficulties, idempotencyKey } = input;

    async function createNewSession(): Promise<StartPracticeSessionOutput> {
      const rate = await d.rateLimiter.limit({
        key: `practice:startPracticeSession:${userId}`,
        ...START_PRACTICE_SESSION_RATE_LIMIT,
      });
      if (!rate.success) {
        throw new ApplicationError(
          'RATE_LIMITED',
          `Too many session starts. Try again in ${rate.retryAfterSeconds}s.`,
        );
      }

      const candidateIds = await d.questionRepository.listPublishedCandidateIds(
        {
          tagSlugs,
          difficulties,
        },
      );
      if (candidateIds.length === 0) {
        throw new ApplicationError('NOT_FOUND', 'No questions found');
      }

      const seed = createSeed(userId, d.now().getTime());
      const questionIds = shuffleWithSeed(candidateIds, seed).slice(0, count);

      const session = await d.practiceSessionRepository.create({
        userId,
        mode,
        paramsJson: {
          count,
          tagSlugs,
          difficulties,
          questionIds,
        },
      });

      return { sessionId: session.id };
    }

    if (!idempotencyKey) {
      return createNewSession();
    }

    return withIdempotency({
      repo: d.idempotencyKeyRepository,
      userId,
      action: 'practice:startPracticeSession',
      key: idempotencyKey,
      now: d.now,
      execute: createNewSession,
    });
  },
});

export const endPracticeSession = createAction({
  schema: EndPracticeSessionInputSchema,
  getDeps,
  execute: async (input, d) => {
    const userId = await requireEntitledUserId(d);

    const session = await d.practiceSessionRepository.end(
      input.sessionId,
      userId,
    );

    const endedAt = session.endedAt;
    if (!endedAt) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Practice session did not end',
      );
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

    return {
      sessionId: session.id,
      endedAt: endedAt.toISOString(),
      totals: {
        answered,
        correct,
        accuracy,
        durationSeconds,
      },
    };
  },
});
