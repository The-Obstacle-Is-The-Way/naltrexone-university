'use server';

import { z } from 'zod';
import { createDepsResolver, loadAppContainer } from '@/lib/controller-helpers';
import { BOOKMARK_MUTATION_RATE_LIMIT } from '@/src/adapters/shared/rate-limits';
import { withIdempotency } from '@/src/adapters/shared/with-idempotency';
import { ApplicationError } from '@/src/application/errors';
import type {
  GetBookmarksInput,
  GetBookmarksOutput,
} from '@/src/application/ports/bookmarks';
import type {
  AuthGateway,
  RateLimiter,
} from '@/src/application/ports/gateways';
import type { IdempotencyKeyRepository } from '@/src/application/ports/repositories';
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
  execute: async (input, d) => {
    const userId = await requireEntitledUserId(d);

    const { questionId, idempotencyKey } = input;

    async function toggle(): Promise<ToggleBookmarkOutput> {
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
        questionId,
      });
    }

    if (!idempotencyKey) {
      return toggle();
    }

    return withIdempotency({
      repo: d.idempotencyKeyRepository,
      userId,
      action: 'bookmark:toggleBookmark',
      key: idempotencyKey,
      now: d.now,
      parseResult: (value) => ToggleBookmarkOutputSchema.parse(value),
      execute: toggle,
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
