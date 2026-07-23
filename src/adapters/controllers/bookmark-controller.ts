'use server';

import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { createDepsResolver, loadAppContainer } from '@/lib/controller-helpers';
import { BOOKMARK_MUTATION_RATE_LIMIT } from '@/src/adapters/shared/rate-limits';
import {
  projectSafeSpanAttributes,
  SERVER_SPAN_FAMILIES,
} from '@/src/adapters/shared/server-tracing';
import { zUuid } from '@/src/adapters/shared/zod-schemas';
import { ApplicationError, isApplicationError } from '@/src/application/errors';
import type {
  GetBookmarkQuestionIdsInput,
  GetBookmarkQuestionIdsOutput,
  GetBookmarkStatusInput,
  GetBookmarkStatusOutput,
  GetBookmarksInput,
  GetBookmarksOutput,
} from '@/src/application/ports/bookmarks';
import type {
  AuthGateway,
  RateLimiter,
} from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';
import type { IdempotencyKeyRepository } from '@/src/application/ports/repositories';
import type {
  SetBookmarkInput,
  SetBookmarkOutput,
} from '@/src/application/use-cases';
import { createAction } from './create-action';
import type { CheckEntitlementUseCase } from './require-entitled-user-id';
import { requireEntitledUserId } from './require-entitled-user-id';
import { executeIdempotent } from './shared/execute-idempotent';
import {
  IdempotentActionNames,
  shouldCacheBookmarkError,
} from './shared/idempotency-error-policy';

const SetBookmarkInputSchema = z
  .object({
    questionId: zUuid,
    bookmarked: z.boolean(),
    idempotencyKey: zUuid.optional(),
  })
  .strict();

const GetBookmarksInputSchema = z.object({}).strict();
const GetBookmarkQuestionIdsInputSchema = z.object({}).strict();
const GetBookmarkStatusInputSchema = z.object({ questionId: zUuid }).strict();

const SetBookmarkOutputSchema = z
  .object({
    bookmarked: z.boolean(),
  })
  .strict();

export type {
  BookmarkRow,
  GetBookmarkQuestionIdsOutput,
  GetBookmarkStatusOutput,
  GetBookmarksOutput,
} from '@/src/application/ports/bookmarks';

export type { SetBookmarkOutput } from '@/src/application/use-cases';

export type BookmarkControllerDeps = {
  authGateway: AuthGateway;
  logger: Logger;
  rateLimiter: RateLimiter;
  idempotencyKeyRepository: IdempotencyKeyRepository;
  checkEntitlementUseCase: CheckEntitlementUseCase;
  setBookmarkUseCase: {
    execute: (input: SetBookmarkInput) => Promise<SetBookmarkOutput>;
  };
  getBookmarksUseCase: {
    execute: (input: GetBookmarksInput) => Promise<GetBookmarksOutput>;
  };
  getBookmarkQuestionIdsUseCase: {
    execute: (
      input: GetBookmarkQuestionIdsInput,
    ) => Promise<GetBookmarkQuestionIdsOutput>;
  };
  getBookmarkStatusUseCase: {
    execute: (
      input: GetBookmarkStatusInput,
    ) => Promise<GetBookmarkStatusOutput>;
  };
  now: () => Date;
};

type BookmarkControllerContainer = {
  createBookmarkControllerDeps: () => BookmarkControllerDeps;
};

const getDeps = createDepsResolver<
  BookmarkControllerDeps,
  BookmarkControllerContainer
>((container) => container.createBookmarkControllerDeps(), loadAppContainer);

export const setBookmark = createAction({
  schema: SetBookmarkInputSchema,
  getDeps,
  execute: async (input, d, meta) => {
    const userId = await requireEntitledUserId(d, meta);

    const { questionId, bookmarked, idempotencyKey } = input;

    async function setDesiredBookmarkState(): Promise<SetBookmarkOutput> {
      return d.setBookmarkUseCase.execute({
        userId,
        questionId,
        bookmarked,
      });
    }

    async function enforceBookmarkRateLimit(): Promise<void> {
      const rate = await d.rateLimiter.limit({
        key: `${IdempotentActionNames.Bookmark}:${userId}`,
        ...BOOKMARK_MUTATION_RATE_LIMIT,
      });
      if (!rate.success) {
        throw new ApplicationError(
          'RATE_LIMITED',
          `Too many bookmark changes. Try again in ${rate.retryAfterSeconds}s.`,
        );
      }
    }

    return executeIdempotent({
      d,
      userId,
      action: IdempotentActionNames.Bookmark,
      idempotencyKey,
      outputSchema: SetBookmarkOutputSchema,
      beforeExecute: enforceBookmarkRateLimit,
      shouldCacheError: shouldCacheBookmarkError,
      execute: setDesiredBookmarkState,
    });
  },
});

export const getBookmarks = createAction({
  schema: GetBookmarksInputSchema,
  getDeps,
  execute: async (_input, d, meta) => {
    const userId = await requireEntitledUserId(d, meta);
    const family = SERVER_SPAN_FAMILIES.getBookmarks;
    return Sentry.startSpan(
      {
        name: family.name,
        op: family.op,
        attributes: projectSafeSpanAttributes({
          'app.action': family.action,
        }),
      },
      async (span) => {
        try {
          const output = await d.getBookmarksUseCase.execute({ userId });
          span.setAttributes(
            projectSafeSpanAttributes({
              'app.count': output.rows.length,
            }),
          );
          return output;
        } catch (error) {
          if (isApplicationError(error)) {
            span.setAttributes(
              projectSafeSpanAttributes({
                'app.error_code': error.code,
              }),
            );
          }
          throw error;
        }
      },
    );
  },
});

export const getBookmarkQuestionIds = createAction({
  schema: GetBookmarkQuestionIdsInputSchema,
  getDeps,
  execute: async (_input, d, meta) => {
    const userId = await requireEntitledUserId(d, meta);
    return d.getBookmarkQuestionIdsUseCase.execute({ userId });
  },
});

export const getBookmarkStatus = createAction({
  schema: GetBookmarkStatusInputSchema,
  getDeps,
  execute: async (input, d, meta) => {
    const userId = await requireEntitledUserId(d, meta);
    return d.getBookmarkStatusUseCase.execute({
      userId,
      questionId: input.questionId,
    });
  },
});
