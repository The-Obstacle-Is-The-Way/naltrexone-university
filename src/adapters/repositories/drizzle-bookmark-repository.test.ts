import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { DrizzleBookmarkRepository } from './drizzle-bookmark-repository';

type RepoDb = ConstructorParameters<typeof DrizzleBookmarkRepository>[0];

function createDbMock() {
  const queryFindFirst = vi.fn();
  const queryFindMany = vi.fn();

  const insertReturning = vi.fn();
  const insertOnConflict = vi.fn(() => ({ returning: insertReturning }));
  const insertValues = vi.fn(() => ({
    onConflictDoNothing: insertOnConflict,
  }));
  const insert = vi.fn(() => ({ values: insertValues }));

  const deleteReturning = vi.fn();
  const deleteWhere = vi.fn(() => ({ returning: deleteReturning }));
  const deleteFn = vi.fn(() => ({ where: deleteWhere }));

  return {
    query: {
      bookmarks: {
        findFirst: queryFindFirst,
        findMany: queryFindMany,
      },
    },
    insert,
    delete: deleteFn,
    _mocks: {
      queryFindFirst,
      queryFindMany,
      insertReturning,
      insertOnConflict,
      insertValues,
      deleteReturning,
      deleteWhere,
      deleteFn,
    },
  } as const;
}

describe('DrizzleBookmarkRepository', () => {
  describe('exists', () => {
    it('returns false when bookmark does not exist', async () => {
      const db = createDbMock();
      db._mocks.queryFindFirst.mockResolvedValue(null);

      const repo = new DrizzleBookmarkRepository(db as unknown as RepoDb);

      await expect(repo.exists('user_1', 'question_1')).resolves.toBe(false);
    });

    it('returns true when bookmark exists', async () => {
      const db = createDbMock();
      db._mocks.queryFindFirst.mockResolvedValue({
        userId: 'user_1',
        questionId: 'question_1',
      });

      const repo = new DrizzleBookmarkRepository(db as unknown as RepoDb);

      await expect(repo.exists('user_1', 'question_1')).resolves.toBe(true);
    });
  });

  describe('add', () => {
    it('returns the inserted bookmark when insert succeeds', async () => {
      const db = createDbMock();
      const createdAt = new Date('2026-02-01T00:00:00Z');
      db._mocks.insertReturning.mockResolvedValue([
        {
          userId: 'user_1',
          questionId: 'question_1',
          createdAt,
        },
      ]);

      const repo = new DrizzleBookmarkRepository(db as unknown as RepoDb);

      await expect(repo.add('user_1', 'question_1')).resolves.toEqual({
        userId: 'user_1',
        questionId: 'question_1',
        createdAt,
      });

      expect(db._mocks.insertValues).toHaveBeenCalledWith({
        userId: 'user_1',
        questionId: 'question_1',
      });
    });

    it('falls back to existing bookmark when insert conflicts', async () => {
      const db = createDbMock();
      const createdAt = new Date('2026-02-01T00:00:00Z');
      db._mocks.insertReturning.mockResolvedValue([]);
      db._mocks.queryFindFirst.mockResolvedValue({
        userId: 'user_1',
        questionId: 'question_1',
        createdAt,
      });

      const repo = new DrizzleBookmarkRepository(db as unknown as RepoDb);

      await expect(repo.add('user_1', 'question_1')).resolves.toEqual({
        userId: 'user_1',
        questionId: 'question_1',
        createdAt,
      });
    });

    it('throws INTERNAL_ERROR when insert conflicts and row is missing', async () => {
      const db = createDbMock();
      db._mocks.insertReturning.mockResolvedValue([]);
      db._mocks.queryFindFirst.mockResolvedValue(null);

      const repo = new DrizzleBookmarkRepository(db as unknown as RepoDb);

      const promise = repo.add('user_1', 'question_1');
      await expect(promise).rejects.toBeInstanceOf(ApplicationError);
      await expect(promise).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    });
  });

  describe('remove', () => {
    it('returns true when a bookmark was removed', async () => {
      const db = createDbMock();
      db._mocks.deleteReturning.mockResolvedValue([
        { userId: 'user_1', questionId: 'question_1' },
      ]);
      const repo = new DrizzleBookmarkRepository(db as unknown as RepoDb);

      await expect(repo.remove('user_1', 'question_1')).resolves.toBe(true);
      expect(db._mocks.deleteFn).toHaveBeenCalledTimes(1);
      expect(db._mocks.deleteWhere).toHaveBeenCalledTimes(1);
    });

    it('returns false when the bookmark is already absent', async () => {
      const db = createDbMock();
      db._mocks.deleteReturning.mockResolvedValue([]);
      const repo = new DrizzleBookmarkRepository(db as unknown as RepoDb);

      await expect(repo.remove('user_1', 'question_1')).resolves.toBe(false);
    });
  });

  describe('listByUserId', () => {
    it('returns bookmarks ordered by createdAt', async () => {
      const db = createDbMock();
      const createdAt = new Date('2026-02-01T00:00:00Z');
      db._mocks.queryFindMany.mockResolvedValue([
        {
          userId: 'user_1',
          questionId: 'question_1',
          createdAt,
        },
      ]);

      const repo = new DrizzleBookmarkRepository(db as unknown as RepoDb);

      await expect(repo.listByUserId('user_1')).resolves.toEqual([
        { userId: 'user_1', questionId: 'question_1', createdAt },
      ]);

      const queryArgs = db._mocks.queryFindMany.mock.calls[0]?.[0];
      expect(queryArgs?.orderBy).toBeDefined();
    });
  });
});
