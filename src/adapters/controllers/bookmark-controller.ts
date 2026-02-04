'use server';

import { z } from 'zod';
import { createDepsResolver, loadAppContainer } from '@/lib/controller-helpers';
import type {
  GetBookmarksInput,
  GetBookmarksOutput,
} from '@/src/application/ports/bookmarks';
import type { AuthGateway } from '@/src/application/ports/gateways';
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
