'use server';

import { z } from 'zod';
import { createDepsResolver } from '@/lib/controller-helpers';
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

export type BookmarkRow = {
  questionId: string;
  slug: string;
  stemMd: string;
  difficulty: 'easy' | 'medium' | 'hard';
  bookmarkedAt: string; // ISO
};

export type GetBookmarksOutput = {
  rows: BookmarkRow[];
};

export type BookmarkControllerDeps = {
  authGateway: AuthGateway;
  checkEntitlementUseCase: CheckEntitlementUseCase;
  bookmarkRepository: BookmarkRepository;
  questionRepository: QuestionRepository;
  logger?: Logger;
};

const getDeps = createDepsResolver((container) =>
  container.createBookmarkControllerDeps(),
);

export async function toggleBookmark(
  input: unknown,
  deps?: BookmarkControllerDeps,
): Promise<ActionResult<ToggleBookmarkOutput>> {
  const parsed = ToggleBookmarkInputSchema.safeParse(input);
  if (!parsed.success) return handleError(parsed.error);

  try {
    const d = await getDeps(deps);
    const userIdOrError = await requireEntitledUserId(d);
    if (typeof userIdOrError !== 'string') return userIdOrError;
    const userId = userIdOrError;

    const question = await d.questionRepository.findPublishedById(
      parsed.data.questionId,
    );
    if (!question) {
      return err('NOT_FOUND', 'Question not found');
    }

    const wasRemoved = await d.bookmarkRepository.remove(
      userId,
      parsed.data.questionId,
    );

    if (wasRemoved) {
      return ok({ bookmarked: false });
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
): Promise<ActionResult<GetBookmarksOutput>> {
  const parsed = GetBookmarksInputSchema.safeParse(input);
  if (!parsed.success) return handleError(parsed.error);

  try {
    const d = await getDeps(deps);
    const userIdOrError = await requireEntitledUserId(d);
    if (typeof userIdOrError !== 'string') return userIdOrError;
    const userId = userIdOrError;

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
        // Skip orphans to return a partial list instead of failing the entire view.
        d.logger?.warn(
          { questionId: bookmark.questionId },
          'Bookmark references missing question',
        );
        continue;
      }

      rows.push({
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
