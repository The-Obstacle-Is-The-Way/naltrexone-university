import { describe, expect, it } from 'vitest';
import { FakeBookmarkRepository } from '@/src/application/test-helpers/fakes';
import { GetBookmarkStatusUseCase } from './get-bookmark-status';

describe('GetBookmarkStatusUseCase', () => {
  it('checks only the requested user and question through the existing exists read', async () => {
    const bookmarks = new FakeBookmarkRepository([
      {
        userId: 'user-1',
        questionId: 'question-1',
        createdAt: new Date('2026-07-20T10:00:00.000Z'),
      },
    ]);
    const useCase = new GetBookmarkStatusUseCase(bookmarks);

    await expect(
      useCase.execute({ userId: 'user-1', questionId: 'question-1' }),
    ).resolves.toEqual({ bookmarked: true });
    await expect(
      useCase.execute({ userId: 'user-1', questionId: 'question-2' }),
    ).resolves.toEqual({ bookmarked: false });
  });
});
