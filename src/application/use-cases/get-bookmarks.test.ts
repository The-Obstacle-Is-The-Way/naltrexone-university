// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createQuestion } from '@/src/domain/test-helpers';
import {
  FakeBookmarkRepository,
  FakeLogger,
  FakeQuestionRepository,
} from '../test-helpers/fakes';
import { GetBookmarksUseCase } from './get-bookmarks';

describe('GetBookmarksUseCase', () => {
  it('returns empty rows without querying questions when the user has no bookmarks', async () => {
    const userId = 'user-1';

    const bookmarks = new FakeBookmarkRepository();
    const questions = new FakeQuestionRepository([
      createQuestion({ id: 'q1', slug: 'q-1', stemMd: 'Stem for q1' }),
    ]);

    const useCase = new GetBookmarksUseCase(
      bookmarks,
      questions,
      new FakeLogger(),
    );

    await expect(useCase.execute({ userId })).resolves.toEqual({ rows: [] });
    expect(questions.findPublishedByIdsCalls).toEqual([]);
  });

  it('returns bookmark rows joined to published questions when the user has bookmarks', async () => {
    const userId = 'user-1';

    const bookmarks = new FakeBookmarkRepository([
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
    ]);

    const questions = new FakeQuestionRepository([
      createQuestion({ id: 'q1', slug: 'q-1', stemMd: 'Stem for q1' }),
      createQuestion({ id: 'q2', slug: 'q-2', stemMd: 'Stem for q2' }),
    ]);

    const useCase = new GetBookmarksUseCase(
      bookmarks,
      questions,
      new FakeLogger(),
    );

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

  it('logs warning and returns unavailable row when bookmark references missing question', async () => {
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
    const useCase = new GetBookmarksUseCase(
      bookmarks,
      new FakeQuestionRepository([]),
      logger,
    );

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
        msg: 'Bookmark references missing question',
      },
    ]);
  });
});
