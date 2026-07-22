import { describe, expect, it } from 'vitest';
import { FakeBookmarkRepository } from '@/src/application/test-helpers/fakes';
import { GetBookmarkQuestionIdsUseCase } from './get-bookmark-question-ids';

describe('GetBookmarkQuestionIdsUseCase', () => {
  it('returns only the user bookmark question IDs in repository order', async () => {
    const bookmarks = new FakeBookmarkRepository([
      {
        userId: 'user-1',
        questionId: 'question-1',
        createdAt: new Date('2026-07-20T10:00:00.000Z'),
      },
      {
        userId: 'user-2',
        questionId: 'question-other-user',
        createdAt: new Date('2026-07-20T10:01:00.000Z'),
      },
    ]);
    const useCase = new GetBookmarkQuestionIdsUseCase(bookmarks);

    await expect(useCase.execute({ userId: 'user-1' })).resolves.toEqual({
      questionIds: ['question-1'],
    });
  });
});
