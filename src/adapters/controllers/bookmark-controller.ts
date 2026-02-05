'use server';

import { z } from 'zod';
import { createDepsResolver, loadAppContainer } from '@/lib/controller-helpers';
import { BOOKMARK_MUTATION_RATE_LIMIT } from '@/src/adapters/shared/rate-limits';
import { ApplicationError } from '@/src/application/errors';
import type {
  GetBookmarksInput,
  GetBookmarksOutput,
} from '@/src/application/ports/bookmarks';
import type {
  AuthGateway,
  RateLimiter,
} from '@/src/application/ports/gateways';
import type {
  ToggleBookmarkInput,
  ToggleBookmarkOutput,
} from '@/src/application/use-cases';
import { createAction } from './create-action';
import type { CheckEntitlementUseCase } from './require-entitled-user-id';
import { requireEntitledUserId } from './require-entitled-user-id';

const zUuid = z.string().uuid();

const ToggleBookmarkInputSchema = z
  .object({
    questionId: zUuid,
  })
  .strict();

const GetBookmarksInputSchema = z.object({}).strict();

export type {
  BookmarkRow,
  GetBookmarksOutput,
} from '@/src/application/ports/bookmarks';

export type { ToggleBookmarkOutput } from '@/src/application/use-cases';

export type BookmarkControllerDeps = {
  authGateway: AuthGateway;
  rateLimiter: RateLimiter;
  checkEntitlementUseCase: CheckEntitlementUseCase;
  toggleBookmarkUseCase: {
    execute: (input: ToggleBookmarkInput) => Promise<ToggleBookmarkOutput>;
  };
  getBookmarksUseCase: {
    execute: (input: GetBookmarksInput) => Promise<GetBookmarksOutput>;
  };
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
  execute: async (input, d) => {
    const userId = await requireEntitledUserId(d);
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
    return d.toggleBookmarkUseCase.execute({
      userId,
      questionId: input.questionId,
    });
  },
});

export const getBookmarks = createAction({
  schema: GetBookmarksInputSchema,
  getDeps,
  execute: async (_input, d) => {
    const userId = await requireEntitledUserId(d);
    return d.getBookmarksUseCase.execute({ userId });
  },
});
