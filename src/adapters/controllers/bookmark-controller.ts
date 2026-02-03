'use server';

import { z } from 'zod';
import {
  createDepsResolver,
  type LoadContainerFn,
  loadAppContainer,
} from '@/lib/controller-helpers';
import type { Logger } from '@/src/adapters/shared/logger';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type {
  BookmarkRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import type { ActionResult } from './action-result';
import { err, handleError, ok } from './action-result';
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

export async function toggleBookmark(
  input: unknown,
  deps?: BookmarkControllerDeps,
  options?: { loadContainer?: LoadContainerFn<BookmarkControllerContainer> },
): Promise<ActionResult<ToggleBookmarkOutput>> {
  const parsed = ToggleBookmarkInputSchema.safeParse(input);
  if (!parsed.success) return handleError(parsed.error);

  try {
    const d = await getDeps(deps, options);
    const userId = await requireEntitledUserId(d);

    const wasRemoved = await d.bookmarkRepository.remove(
      userId,
      parsed.data.questionId,
    );

    if (wasRemoved) {
      return ok({ bookmarked: false });
    }

    const question = await d.questionRepository.findPublishedById(
      parsed.data.questionId,
    );
    if (!question) {
      return err('NOT_FOUND', 'Question not found');
    }

    await d.bookmarkRepository.add(userId, parsed.data.questionId);
    return ok({ bookmarked: true });
  } catch (error) {
    return handleError(error);
  }
}

export async function getBookmarks(
  input: unknown,
  deps?: BookmarkControllerDeps,
  options?: { loadContainer?: LoadContainerFn<BookmarkControllerContainer> },
): Promise<ActionResult<GetBookmarksOutput>> {
  const parsed = GetBookmarksInputSchema.safeParse(input);
  if (!parsed.success) return handleError(parsed.error);

  try {
    const d = await getDeps(deps, options);
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

    return ok({ rows });
  } catch (error) {
    return handleError(error);
  }
}
