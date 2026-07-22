// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { FakeBookmarkRepository, FakeLogger } from '../test-helpers/fakes';
import { GetBookmarksUseCase } from './get-bookmarks';

describe('GetBookmarksUseCase', () => {
  it('returns empty rows when the user has no bookmarks', async () => {
    const userId = 'user-1';

    const bookmarks = new FakeBookmarkRepository();
    const useCase = new GetBookmarksUseCase(bookmarks, new FakeLogger());

    await expect(useCase.execute({ userId })).resolves.toEqual({ rows: [] });
  });

  it('returns bookmark rows joined to published questions when the user has bookmarks', async () => {
    const userId = 'user-1';

    const bookmarks = new FakeBookmarkRepository(
      [
        {
          userId,
          questionId: 'q1',
          createdAt: new Date('2026-02-01T00:00:00Z'),
        },
        {
          userId,
          questionId: 'q2',
          createdAt: new Date('2026-01-31T00:00:00Z'),
        },
      ],
      () => new Date(),
      new Map([
        ['q1', { slug: 'q-1', stemMd: 'Stem for q1', difficulty: 'easy' }],
        ['q2', { slug: 'q-2', stemMd: 'Stem for q2', difficulty: 'easy' }],
      ]),
    );

    const useCase = new GetBookmarksUseCase(bookmarks, new FakeLogger());

    await expect(useCase.execute({ userId })).resolves.toEqual({
      rows: [
        {
          isAvailable: true,
          questionId: 'q1',
          slug: 'q-1',
          stemMd: 'Stem for q1',
          difficulty: 'easy',
          bookmarkedAt: '2026-02-01T00:00:00.000Z',
        },
        {
          isAvailable: true,
          questionId: 'q2',
          slug: 'q-2',
          stemMd: 'Stem for q2',
          difficulty: 'easy',
          bookmarkedAt: '2026-01-31T00:00:00.000Z',
        },
      ],
    });
  });

  it('returns unavailable row when bookmark references an unavailable question', async () => {
    const userId = 'user-1';
    const orphanedQuestionId = 'q-orphaned';

    const bookmarks = new FakeBookmarkRepository([
      {
        userId,
        questionId: orphanedQuestionId,
        createdAt: new Date('2026-02-01T00:00:00Z'),
      },
    ]);

    const logger = new FakeLogger();
    const useCase = new GetBookmarksUseCase(bookmarks, logger);

    await expect(useCase.execute({ userId })).resolves.toEqual({
      rows: [
        {
          isAvailable: false,
          questionId: orphanedQuestionId,
          bookmarkedAt: '2026-02-01T00:00:00.000Z',
        },
      ],
    });
    expect(logger.warnCalls).toEqual([
      {
        context: { questionId: orphanedQuestionId },
        msg: 'Bookmark references unavailable or unpublished question',
      },
    ]);
  });

  it('propagates repository failures', async () => {
    const bookmarks = new FakeBookmarkRepository();
    bookmarks.listSummariesByUserId = async () => {
      throw new ApplicationError('INTERNAL_ERROR', 'Bookmarks unavailable');
    };

    const useCase = new GetBookmarksUseCase(bookmarks, new FakeLogger());

    await expect(useCase.execute({ userId: 'user-1' })).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });
});
