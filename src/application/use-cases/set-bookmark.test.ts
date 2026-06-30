import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import {
  FakeBookmarkRepository,
  FakeQuestionRepository,
} from '@/src/application/test-helpers/fakes';
import { SetBookmarkUseCase } from '@/src/application/use-cases/set-bookmark';
import { createQuestion } from '@/src/domain/test-helpers';

describe('SetBookmarkUseCase', () => {
  const userId = 'user-1';
  const questionId = 'q1';
  const now = new Date('2026-02-01T00:00:00Z');

  it('returns bookmarked=false when an existing bookmark is removed', async () => {
    const bookmarks = new FakeBookmarkRepository([
      { userId, questionId, createdAt: now },
    ]);
    const useCase = new SetBookmarkUseCase(
      bookmarks,
      new FakeQuestionRepository([]),
    );

    await expect(
      useCase.execute({ userId, questionId, bookmarked: false }),
    ).resolves.toEqual({ bookmarked: false });
    await expect(bookmarks.exists(userId, questionId)).resolves.toBe(false);
  });

  it('returns bookmarked=false when removing an already absent bookmark', async () => {
    const bookmarks = new FakeBookmarkRepository();
    const useCase = new SetBookmarkUseCase(
      bookmarks,
      new FakeQuestionRepository([]),
    );

    await expect(
      useCase.execute({ userId, questionId, bookmarked: false }),
    ).resolves.toEqual({ bookmarked: false });
    await expect(bookmarks.exists(userId, questionId)).resolves.toBe(false);
  });

  it('does not re-add a bookmark when two stale remove intents execute independently', async () => {
    const bookmarks = new FakeBookmarkRepository([
      { userId, questionId, createdAt: now },
    ]);
    const useCase = new SetBookmarkUseCase(
      bookmarks,
      new FakeQuestionRepository([]),
    );

    await expect(
      useCase.execute({ userId, questionId, bookmarked: false }),
    ).resolves.toEqual({ bookmarked: false });
    await expect(
      useCase.execute({ userId, questionId, bookmarked: false }),
    ).resolves.toEqual({ bookmarked: false });
    await expect(bookmarks.exists(userId, questionId)).resolves.toBe(false);
  });

  it('returns bookmarked=true when adding a published question', async () => {
    const bookmarks = new FakeBookmarkRepository();
    const questions = new FakeQuestionRepository([
      createQuestion({ id: questionId, status: 'published' }),
    ]);
    const useCase = new SetBookmarkUseCase(bookmarks, questions);

    await expect(
      useCase.execute({ userId, questionId, bookmarked: true }),
    ).resolves.toEqual({ bookmarked: true });
    await expect(bookmarks.exists(userId, questionId)).resolves.toBe(true);
  });

  it('returns bookmarked=true without duplicating an existing bookmark', async () => {
    const bookmarks = new FakeBookmarkRepository([
      { userId, questionId, createdAt: now },
    ]);
    const questions = new FakeQuestionRepository([
      createQuestion({ id: questionId, status: 'published' }),
    ]);
    const useCase = new SetBookmarkUseCase(bookmarks, questions);

    await expect(
      useCase.execute({ userId, questionId, bookmarked: true }),
    ).resolves.toEqual({ bookmarked: true });
    await expect(bookmarks.listByUserId(userId)).resolves.toHaveLength(1);
  });

  it('returns bookmarked=true for an existing bookmark when the question is no longer published', async () => {
    const bookmarks = new FakeBookmarkRepository([
      { userId, questionId, createdAt: now },
    ]);
    const questions = new FakeQuestionRepository([
      createQuestion({ id: questionId, status: 'archived' }),
    ]);
    const useCase = new SetBookmarkUseCase(bookmarks, questions);

    await expect(
      useCase.execute({ userId, questionId, bookmarked: true }),
    ).resolves.toEqual({ bookmarked: true });
    await expect(bookmarks.listByUserId(userId)).resolves.toHaveLength(1);
  });

  it('throws NOT_FOUND when adding an unpublished question', async () => {
    const questions = new FakeQuestionRepository([
      createQuestion({ id: questionId, status: 'draft' }),
    ]);
    const useCase = new SetBookmarkUseCase(
      new FakeBookmarkRepository(),
      questions,
    );

    await expect(
      useCase.execute({ userId, questionId, bookmarked: true }),
    ).rejects.toEqual(new ApplicationError('NOT_FOUND', 'Question not found'));
  });

  it('removes an unpublished bookmark without checking published question availability', async () => {
    const bookmarks = new FakeBookmarkRepository([
      { userId, questionId, createdAt: now },
    ]);
    const questions = new FakeQuestionRepository([
      createQuestion({ id: questionId, status: 'archived' }),
    ]);
    const useCase = new SetBookmarkUseCase(bookmarks, questions);

    await expect(
      useCase.execute({ userId, questionId, bookmarked: false }),
    ).resolves.toEqual({ bookmarked: false });
    await expect(bookmarks.exists(userId, questionId)).resolves.toBe(false);
  });
});
