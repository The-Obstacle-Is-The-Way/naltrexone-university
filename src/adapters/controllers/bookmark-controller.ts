'use server';

import { z } from 'zod';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type {
  BookmarkRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import type {
  CheckEntitlementInput,
  CheckEntitlementOutput,
} from '@/src/application/use-cases/check-entitlement';
import type { ActionResult } from './action-result';
import { err, handleError, ok } from './action-result';

const zUuid = z.string().uuid();

const ToggleBookmarkInputSchema = z
  .object({
    questionId: zUuid,
  })
  .strict();

const GetBookmarksInputSchema = z.object({}).strict();

type CheckEntitlementUseCase = {
  execute: (input: CheckEntitlementInput) => Promise<CheckEntitlementOutput>;
};

type Logger = {
  warn: (msg: string, context?: Record<string, unknown>) => void;
};

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

async function getDeps(
  deps?: BookmarkControllerDeps,
): Promise<BookmarkControllerDeps> {
  if (deps) return deps;

  const { createContainer } = await import('@/lib/container');
  return createContainer().createBookmarkControllerDeps();
}

async function requireEntitledUserId(
  deps: BookmarkControllerDeps,
): Promise<string | ActionResult<never>> {
  const user = await deps.authGateway.requireUser();
  const entitlement = await deps.checkEntitlementUseCase.execute({
    userId: user.id,
  });

  if (!entitlement.isEntitled) {
    return err('UNSUBSCRIBED', 'Subscription required');
  }

  return user.id;
}

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
        d.logger?.warn('Bookmark references missing question', {
          questionId: bookmark.questionId,
        });
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
