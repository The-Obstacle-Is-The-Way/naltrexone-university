// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createQuestion } from '@/src/domain/test-helpers';
import { ApplicationError } from '../errors';
import {
  FakeBookmarkRepository,
  FakeQuestionRepository,
} from '../test-helpers/fakes';
import { ToggleBookmarkUseCase } from './toggle-bookmark';

describe('ToggleBookmarkUseCase', () => {
  it('returns bookmarked=false when an existing bookmark is removed', async () => {
    const userId = 'user-1';
    const questionId = 'q1';

    const bookmarks = new FakeBookmarkRepository([
      {
        userId,
        questionId,
        createdAt: new Date('2026-02-01T00:00:00Z'),
      },
    ]);

    const useCase = new ToggleBookmarkUseCase(
      bookmarks,
      new FakeQuestionRepository([]),
    );

    await expect(useCase.execute({ userId, questionId })).resolves.toEqual({
      bookmarked: false,
    });
    await expect(bookmarks.exists(userId, questionId)).resolves.toBe(false);
  });

  it('returns bookmarked=true when none exists', async () => {
    const userId = 'user-1';
    const questionId = 'q1';

    const bookmarks = new FakeBookmarkRepository();
    const questions = new FakeQuestionRepository([
      createQuestion({ id: questionId, status: 'published' }),
    ]);

    const useCase = new ToggleBookmarkUseCase(bookmarks, questions);

    await expect(useCase.execute({ userId, questionId })).resolves.toEqual({
      bookmarked: true,
    });
    await expect(bookmarks.exists(userId, questionId)).resolves.toBe(true);
  });

  it('returns NOT_FOUND when the question is missing', async () => {
    const useCase = new ToggleBookmarkUseCase(
      new FakeBookmarkRepository(),
      new FakeQuestionRepository([]),
    );

    await expect(
      useCase.execute({ userId: 'user-1', questionId: 'missing' }),
    ).rejects.toEqual(new ApplicationError('NOT_FOUND', 'Question not found'));
  });
});
