import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import { bookmarks } from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import { DrizzleBookmarkRepository } from './drizzle-bookmark-repository';

type RepoDb = ConstructorParameters<typeof DrizzleBookmarkRepository>[0];

const userId = crypto.randomUUID();
const questionId = crypto.randomUUID();

function createDbMock() {
  const queryFindFirst = vi.fn();
  const queryFindMany = vi.fn();

  const insertReturning = vi.fn();
  const insertOnConflictDoUpdate = vi.fn(() => ({
    returning: insertReturning,
  }));
  const insertValues = vi.fn(() => ({
    onConflictDoUpdate: insertOnConflictDoUpdate,
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
      insertOnConflictDoUpdate,
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

      await expect(repo.exists(userId, questionId)).resolves.toBe(false);
    });

    it('returns true when bookmark exists', async () => {
      const db = createDbMock();
      db._mocks.queryFindFirst.mockResolvedValue({
        userId: userId,
        questionId: questionId,
      });

      const repo = new DrizzleBookmarkRepository(db as unknown as RepoDb);

      await expect(repo.exists(userId, questionId)).resolves.toBe(true);
    });
  });

  describe('add', () => {
    it('returns the inserted bookmark when insert succeeds', async () => {
      const db = createDbMock();
      const createdAt = new Date('2026-02-01T00:00:00Z');
      db._mocks.insertReturning.mockResolvedValue([
        {
          userId: userId,
          questionId: questionId,
          createdAt,
        },
      ]);

      const repo = new DrizzleBookmarkRepository(db as unknown as RepoDb);

      await expect(repo.add(userId, questionId)).resolves.toEqual({
        userId: userId,
        questionId: questionId,
        createdAt,
      });

      expect(db._mocks.insertValues).toHaveBeenCalledWith({
        userId: userId,
        questionId: questionId,
      });
      expect(db._mocks.insertOnConflictDoUpdate).toHaveBeenCalledWith({
        target: [bookmarks.userId, bookmarks.questionId],
        set: { createdAt: expect.anything() },
      });
    });

    it('throws INTERNAL_ERROR when insert returns no rows', async () => {
      const db = createDbMock();
      db._mocks.insertReturning.mockResolvedValue([]);

      const repo = new DrizzleBookmarkRepository(db as unknown as RepoDb);

      const promise = repo.add(userId, questionId);
      await expect(promise).rejects.toBeInstanceOf(ApplicationError);
      await expect(promise).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    });
  });

  describe('remove', () => {
    it('returns true when a bookmark was removed', async () => {
      const db = createDbMock();
      db._mocks.deleteReturning.mockResolvedValue([
        { userId: userId, questionId: questionId },
      ]);
      const repo = new DrizzleBookmarkRepository(db as unknown as RepoDb);

      await expect(repo.remove(userId, questionId)).resolves.toBe(true);
      expect(db._mocks.deleteFn).toHaveBeenCalledTimes(1);
      expect(db._mocks.deleteWhere).toHaveBeenCalledTimes(1);
    });

    it('returns false when the bookmark is already absent', async () => {
      const db = createDbMock();
      db._mocks.deleteReturning.mockResolvedValue([]);
      const repo = new DrizzleBookmarkRepository(db as unknown as RepoDb);

      await expect(repo.remove(userId, questionId)).resolves.toBe(false);
    });
  });

  describe('listByUserId', () => {
    it('returns bookmarks ordered by createdAt', async () => {
      const db = createDbMock();
      const createdAt = new Date('2026-02-01T00:00:00Z');
      db._mocks.queryFindMany.mockResolvedValue([
        {
          userId: userId,
          questionId: questionId,
          createdAt,
        },
      ]);

      const repo = new DrizzleBookmarkRepository(db as unknown as RepoDb);

      await expect(repo.listByUserId(userId)).resolves.toEqual([
        { userId: userId, questionId: questionId, createdAt },
      ]);

      const queryArgs = db._mocks.queryFindMany.mock.calls[0]?.[0];
      const orderBy = queryArgs?.orderBy;
      expect(orderBy).toBeDefined();

      if (!orderBy) {
        throw new Error('Expected query to define an orderBy clause');
      }

      const orderBySql = new PgDialect().sqlToQuery(orderBy as SQL).sql;
      expect(orderBySql).toMatch(/"bookmarks"\."created_at"\s+desc/i);
    });
  });
});
