'use server';

import { z } from 'zod';
import { createDepsResolver, loadAppContainer } from '@/lib/controller-helpers';
import type { Logger } from '@/src/adapters/shared/logger';
import { ApplicationError } from '@/src/application/errors';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type {
  BookmarkRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
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

export type ToggleBookmarkOutput = {
  bookmarked: boolean;
};

export type AvailableBookmarkRow = {
  isAvailable: true;
  questionId: string;
  slug: string;
  stemMd: string;
  difficulty: 'easy' | 'medium' | 'hard';
  bookmarkedAt: string; // ISO
};

export type UnavailableBookmarkRow = {
  isAvailable: false;
  questionId: string;
  bookmarkedAt: string; // ISO
};

export type BookmarkRow = AvailableBookmarkRow | UnavailableBookmarkRow;

export type GetBookmarksOutput = {
  rows: BookmarkRow[];
};

export type BookmarkControllerDeps = {
  authGateway: AuthGateway;
  checkEntitlementUseCase: CheckEntitlementUseCase;
  bookmarkRepository: BookmarkRepository;
  questionRepository: QuestionRepository;
  logger: Logger;
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

    const wasRemoved = await d.bookmarkRepository.remove(
      userId,
      input.questionId,
    );

    if (wasRemoved) {
      return { bookmarked: false };
    }

    const question = await d.questionRepository.findPublishedById(
      input.questionId,
    );
    if (!question) {
      throw new ApplicationError('NOT_FOUND', 'Question not found');
    }

    await d.bookmarkRepository.add(userId, input.questionId);
    return { bookmarked: true };
  },
});

export const getBookmarks = createAction({
  schema: GetBookmarksInputSchema,
  getDeps,
  execute: async (_input, d) => {
    const userId = await requireEntitledUserId(d);

    const bookmarks = await d.bookmarkRepository.listByUserId(userId);
    const questionIds = bookmarks.map((b) => b.questionId);
    const questions =
      await d.questionRepository.findPublishedByIds(questionIds);
    const byId = new Map(questions.map((q) => [q.id, q]));

    const rows: BookmarkRow[] = [];
    for (const bookmark of bookmarks) {
      const question = byId.get(bookmark.questionId);
      if (!question) {
        // Graceful degradation: questions can be unpublished/deleted while bookmarks persist.
        d.logger.warn(
          { questionId: bookmark.questionId },
          'Bookmark references missing question',
        );

        rows.push({
          isAvailable: false,
          questionId: bookmark.questionId,
          bookmarkedAt: bookmark.createdAt.toISOString(),
        });
        continue;
      }

      rows.push({
        isAvailable: true,
        questionId: question.id,
        slug: question.slug,
        stemMd: question.stemMd,
        difficulty: question.difficulty,
        bookmarkedAt: bookmark.createdAt.toISOString(),
      });
    }

    return { rows };
  },
});
