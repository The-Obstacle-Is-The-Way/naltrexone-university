'use server';

import { z } from 'zod';
import { createDepsResolver, loadAppContainer } from '@/lib/controller-helpers';
import { START_PRACTICE_SESSION_RATE_LIMIT } from '@/src/adapters/shared/rate-limits';
import {
  MAX_PAGINATION_LIMIT,
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
  GetIncompletePracticeSessionInput,
  GetIncompletePracticeSessionOutput,
  GetPracticeSessionReviewInput,
  GetPracticeSessionReviewOutput,
  GetSessionHistoryInput,
  GetSessionHistoryOutput,
  SetPracticeSessionQuestionMarkInput,
  SetPracticeSessionQuestionMarkOutput,
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

const GetPracticeSessionReviewInputSchema = z
  .object({
    sessionId: zUuid,
  })
  .strict();

const SetPracticeSessionQuestionMarkInputSchema = z
  .object({
    sessionId: zUuid,
    questionId: zUuid,
    markedForReview: z.boolean(),
  })
  .strict();

const GetSessionHistoryInputSchema = z
  .object({
    limit: z.number().int().min(1).max(MAX_PAGINATION_LIMIT),
    offset: z.number().int().min(0),
  })
  .strict();

const EmptyInputSchema = z.object({}).strict();

const StartPracticeSessionOutputSchema = z
  .object({
    sessionId: zUuid,
  })
  .strict();

const GetIncompletePracticeSessionOutputSchema = z
  .object({
    sessionId: zUuid,
    mode: zPracticeMode,
    answeredCount: z.number().int().min(0),
    totalCount: z.number().int().min(1).max(MAX_PRACTICE_SESSION_QUESTIONS),
    startedAt: z.string().datetime(),
  })
  .nullable();

export type {
  EndPracticeSessionOutput,
  GetIncompletePracticeSessionOutput,
  GetPracticeSessionReviewOutput,
  GetSessionHistoryOutput,
  SetPracticeSessionQuestionMarkOutput,
  StartPracticeSessionOutput,
} from '@/src/application/use-cases';

export type PracticeControllerDeps = {
  authGateway: AuthGateway;
  rateLimiter: RateLimiter;
  idempotencyKeyRepository: IdempotencyKeyRepository;
  checkEntitlementUseCase: CheckEntitlementUseCase;
  getIncompletePracticeSessionUseCase: {
    execute: (
      input: GetIncompletePracticeSessionInput,
    ) => Promise<GetIncompletePracticeSessionOutput>;
  };
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
  getPracticeSessionReviewUseCase: {
    execute: (
      input: GetPracticeSessionReviewInput,
    ) => Promise<GetPracticeSessionReviewOutput>;
  };
  getSessionHistoryUseCase: {
    execute: (
      input: GetSessionHistoryInput,
    ) => Promise<GetSessionHistoryOutput>;
  };
  setPracticeSessionQuestionMarkUseCase: {
    execute: (
      input: SetPracticeSessionQuestionMarkInput,
    ) => Promise<SetPracticeSessionQuestionMarkOutput>;
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
      parseResult: (value) => StartPracticeSessionOutputSchema.parse(value),
      execute: createNewSession,
    });
  },
});

export const getIncompletePracticeSession = createAction({
  schema: EmptyInputSchema,
  getDeps,
  execute: async (_input, d) => {
    const userId = await requireEntitledUserId(d);
    const output = await d.getIncompletePracticeSessionUseCase.execute({
      userId,
    });
    return GetIncompletePracticeSessionOutputSchema.parse(output);
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

export const getPracticeSessionReview = createAction({
  schema: GetPracticeSessionReviewInputSchema,
  getDeps,
  execute: async (input, d) => {
    const userId = await requireEntitledUserId(d);
    return d.getPracticeSessionReviewUseCase.execute({
      userId,
      sessionId: input.sessionId,
    });
  },
});

export const getSessionHistory = createAction({
  schema: GetSessionHistoryInputSchema,
  getDeps,
  execute: async (input, d) => {
    const userId = await requireEntitledUserId(d);
    return d.getSessionHistoryUseCase.execute({
      userId,
      limit: input.limit,
      offset: input.offset,
    });
  },
});

export const setPracticeSessionQuestionMark = createAction({
  schema: SetPracticeSessionQuestionMarkInputSchema,
  getDeps,
  execute: async (input, d) => {
    const userId = await requireEntitledUserId(d);
    return d.setPracticeSessionQuestionMarkUseCase.execute({
      userId,
      sessionId: input.sessionId,
      questionId: input.questionId,
      markedForReview: input.markedForReview,
    });
  },
});
