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
import type { IdempotencyKeyRepository } from '@/src/application/ports/repositories';
import type {
  EndPracticeSessionInput,
  EndPracticeSessionOutput,
  StartPracticeSessionInput,
  StartPracticeSessionOutput,
} from '@/src/application/use-cases';
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

export type {
  EndPracticeSessionOutput,
  StartPracticeSessionOutput,
} from '@/src/application/use-cases';

export type PracticeControllerDeps = {
  authGateway: AuthGateway;
  rateLimiter: RateLimiter;
  idempotencyKeyRepository: IdempotencyKeyRepository;
  checkEntitlementUseCase: CheckEntitlementUseCase;
  startPracticeSessionUseCase: {
    execute: (
      input: StartPracticeSessionInput,
    ) => Promise<StartPracticeSessionOutput>;
  };
  endPracticeSessionUseCase: {
    execute: (
      input: EndPracticeSessionInput,
    ) => Promise<EndPracticeSessionOutput>;
  };
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

      return d.startPracticeSessionUseCase.execute({
        userId,
        mode,
        count,
        tagSlugs,
        difficulties,
      });
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
    return d.endPracticeSessionUseCase.execute({
      userId,
      sessionId: input.sessionId,
    });
  },
});
