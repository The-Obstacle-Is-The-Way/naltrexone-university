'use server';

import { z } from 'zod';
import { createDepsResolver, loadAppContainer } from '@/lib/controller-helpers';
import { BOOKMARK_MUTATION_RATE_LIMIT } from '@/src/adapters/shared/rate-limits';
import { zUuid } from '@/src/adapters/shared/zod-schemas';
import { ApplicationError } from '@/src/application/errors';
import type {
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
  ToggleBookmarkInput,
  ToggleBookmarkOutput,
} from '@/src/application/use-cases';
import { createAction } from './create-action';
import type { CheckEntitlementUseCase } from './require-entitled-user-id';
import { requireEntitledUserId } from './require-entitled-user-id';
import { executeIdempotent } from './shared/execute-idempotent';

const ToggleBookmarkInputSchema = z
  .object({
    questionId: zUuid,
    idempotencyKey: zUuid.optional(),
  })
  .strict();

const GetBookmarksInputSchema = z.object({}).strict();

const ToggleBookmarkOutputSchema = z
  .object({
    bookmarked: z.boolean(),
  })
  .strict();

export type {
  BookmarkRow,
  GetBookmarksOutput,
} from '@/src/application/ports/bookmarks';

export type { ToggleBookmarkOutput } from '@/src/application/use-cases';

export type BookmarkControllerDeps = {
  authGateway: AuthGateway;
  logger: Logger;
  rateLimiter: RateLimiter;
  idempotencyKeyRepository: IdempotencyKeyRepository;
  checkEntitlementUseCase: CheckEntitlementUseCase;
  toggleBookmarkUseCase: {
    execute: (input: ToggleBookmarkInput) => Promise<ToggleBookmarkOutput>;
  };
  getBookmarksUseCase: {
    execute: (input: GetBookmarksInput) => Promise<GetBookmarksOutput>;
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

export const toggleBookmark = createAction({
  schema: ToggleBookmarkInputSchema,
  getDeps,
  execute: async (input, d, meta) => {
    const userId = await requireEntitledUserId(d, meta);

    const { questionId, idempotencyKey } = input;

    async function toggle(): Promise<ToggleBookmarkOutput> {
      return d.toggleBookmarkUseCase.execute({
        userId,
        questionId,
      });
    }

    async function enforceBookmarkRateLimit(): Promise<void> {
      const rate = await d.rateLimiter.limit({
        key: `bookmark:toggleBookmark:${userId}`,
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
      action: 'bookmark:toggleBookmark',
      idempotencyKey,
      outputSchema: ToggleBookmarkOutputSchema,
      beforeExecute: enforceBookmarkRateLimit,
      execute: toggle,
    });
  },
});

export const getBookmarks = createAction({
  schema: GetBookmarksInputSchema,
  getDeps,
  execute: async (_input, d, meta) => {
    const userId = await requireEntitledUserId(d, meta);
    return d.getBookmarksUseCase.execute({ userId });
  },
});
