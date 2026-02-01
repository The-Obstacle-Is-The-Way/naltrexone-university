import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { DrizzleUserRepository } from './drizzle-user-repository';

type RepoDb = ConstructorParameters<typeof DrizzleUserRepository>[0];

function createDbMock() {
  const queryFindFirst = vi.fn();

  const updateReturning = vi.fn();
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));

  const insertReturning = vi.fn();
  const insertOnConflictDoNothing = vi.fn(() => ({
    returning: insertReturning,
  }));
  const insertValues = vi.fn(() => ({
    onConflictDoNothing: insertOnConflictDoNothing,
  }));
  const insert = vi.fn(() => ({ values: insertValues }));

  return {
    query: {
      users: {
        findFirst: queryFindFirst,
      },
    },
    update,
    insert,
    _mocks: {
      queryFindFirst,
      updateReturning,
      updateWhere,
      updateSet,
      insertReturning,
      insertOnConflictDoNothing,
      insertValues,
    },
  } as const;
}

describe('DrizzleUserRepository', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('findByClerkId', () => {
    it('returns null when user does not exist', async () => {
      const db = createDbMock();
      db._mocks.queryFindFirst.mockResolvedValue(null);

      const repo = new DrizzleUserRepository(db as unknown as RepoDb);

      await expect(repo.findByClerkId('clerk_1')).resolves.toBeNull();
    });

    it('returns the user when found', async () => {
      const db = createDbMock();
      const row = {
        id: 'user_1',
        clerkUserId: 'clerk_1',
        email: 'a@example.com',
        createdAt: new Date('2026-02-01T00:00:00Z'),
        updatedAt: new Date('2026-02-01T00:00:00Z'),
      };
      db._mocks.queryFindFirst.mockResolvedValue(row);

      const repo = new DrizzleUserRepository(db as unknown as RepoDb);

      await expect(repo.findByClerkId('clerk_1')).resolves.toEqual({
        id: 'user_1',
        email: 'a@example.com',
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
    });
  });

  describe('upsertByClerkId', () => {
    it('returns existing user when email matches', async () => {
      const db = createDbMock();
      const existing = {
        id: 'user_1',
        clerkUserId: 'clerk_1',
        email: 'a@example.com',
        createdAt: new Date('2026-02-01T00:00:00Z'),
        updatedAt: new Date('2026-02-01T00:00:00Z'),
      };
      db._mocks.queryFindFirst.mockResolvedValue(existing);

      const repo = new DrizzleUserRepository(db as unknown as RepoDb);

      await expect(
        repo.upsertByClerkId('clerk_1', 'a@example.com'),
      ).resolves.toEqual({
        id: existing.id,
        email: existing.email,
        createdAt: existing.createdAt,
        updatedAt: existing.updatedAt,
      });

      expect(db.update).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('updates email when user exists with different email', async () => {
      vi.useFakeTimers();
      const now = new Date('2026-02-01T01:00:00Z');
      vi.setSystemTime(now);

      const db = createDbMock();
      const existing = {
        id: 'user_1',
        clerkUserId: 'clerk_1',
        email: 'old@example.com',
        createdAt: new Date('2026-02-01T00:00:00Z'),
        updatedAt: new Date('2026-02-01T00:00:00Z'),
      };
      const updated = { ...existing, email: 'new@example.com', updatedAt: now };

      db._mocks.queryFindFirst.mockResolvedValue(existing);
      db._mocks.updateReturning.mockResolvedValue([updated]);

      const repo = new DrizzleUserRepository(db as unknown as RepoDb);

      await expect(
        repo.upsertByClerkId('clerk_1', 'new@example.com'),
      ).resolves.toEqual({
        id: updated.id,
        email: updated.email,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      });

      expect(db.update).toHaveBeenCalled();
      expect(db._mocks.updateSet).toHaveBeenCalledWith({
        email: 'new@example.com',
        updatedAt: now,
      });
    });

    it('throws INTERNAL_ERROR when update returns no rows', async () => {
      const db = createDbMock();
      const existing = {
        id: 'user_1',
        clerkUserId: 'clerk_1',
        email: 'old@example.com',
        createdAt: new Date('2026-02-01T00:00:00Z'),
        updatedAt: new Date('2026-02-01T00:00:00Z'),
      };

      db._mocks.queryFindFirst.mockResolvedValue(existing);
      db._mocks.updateReturning.mockResolvedValue([]);

      const repo = new DrizzleUserRepository(db as unknown as RepoDb);

      const promise = repo.upsertByClerkId('clerk_1', 'new@example.com');
      await expect(promise).rejects.toBeInstanceOf(ApplicationError);
      await expect(promise).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    });

    it('inserts new user when not found', async () => {
      const db = createDbMock();
      const inserted = {
        id: 'user_1',
        clerkUserId: 'clerk_1',
        email: 'new@example.com',
        createdAt: new Date('2026-02-01T00:00:00Z'),
        updatedAt: new Date('2026-02-01T00:00:00Z'),
      };

      db._mocks.queryFindFirst.mockResolvedValue(null);
      db._mocks.insertReturning.mockResolvedValue([inserted]);

      const repo = new DrizzleUserRepository(db as unknown as RepoDb);

      await expect(
        repo.upsertByClerkId('clerk_1', 'new@example.com'),
      ).resolves.toEqual({
        id: inserted.id,
        email: inserted.email,
        createdAt: inserted.createdAt,
        updatedAt: inserted.updatedAt,
      });

      expect(db._mocks.insertValues).toHaveBeenCalledWith({
        clerkUserId: 'clerk_1',
        email: 'new@example.com',
      });
    });

    it('handles race condition by re-fetching after conflict', async () => {
      const db = createDbMock();
      const after = {
        id: 'user_1',
        clerkUserId: 'clerk_1',
        email: 'a@example.com',
        createdAt: new Date('2026-02-01T00:00:00Z'),
        updatedAt: new Date('2026-02-01T00:00:00Z'),
      };

      db._mocks.queryFindFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(after);
      db._mocks.insertReturning.mockResolvedValue([]);

      const repo = new DrizzleUserRepository(db as unknown as RepoDb);

      await expect(
        repo.upsertByClerkId('clerk_1', 'a@example.com'),
      ).resolves.toEqual({
        id: after.id,
        email: after.email,
        createdAt: after.createdAt,
        updatedAt: after.updatedAt,
      });

      expect(db._mocks.queryFindFirst).toHaveBeenCalledTimes(2);
      expect(db.update).not.toHaveBeenCalled();
    });

    it('updates email after race condition if email differs', async () => {
      vi.useFakeTimers();
      const now = new Date('2026-02-01T01:00:00Z');
      vi.setSystemTime(now);

      const db = createDbMock();
      const after = {
        id: 'user_1',
        clerkUserId: 'clerk_1',
        email: 'old@example.com',
        createdAt: new Date('2026-02-01T00:00:00Z'),
        updatedAt: new Date('2026-02-01T00:00:00Z'),
      };
      const updated = { ...after, email: 'new@example.com', updatedAt: now };

      db._mocks.queryFindFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(after);
      db._mocks.insertReturning.mockResolvedValue([]);
      db._mocks.updateReturning.mockResolvedValue([updated]);

      const repo = new DrizzleUserRepository(db as unknown as RepoDb);

      await expect(
        repo.upsertByClerkId('clerk_1', 'new@example.com'),
      ).resolves.toEqual({
        id: updated.id,
        email: updated.email,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      });

      expect(db.update).toHaveBeenCalled();
    });

    it('throws INTERNAL_ERROR when update after conflict returns no rows', async () => {
      const db = createDbMock();
      const after = {
        id: 'user_1',
        clerkUserId: 'clerk_1',
        email: 'old@example.com',
        createdAt: new Date('2026-02-01T00:00:00Z'),
        updatedAt: new Date('2026-02-01T00:00:00Z'),
      };

      db._mocks.queryFindFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(after);
      db._mocks.insertReturning.mockResolvedValue([]);
      db._mocks.updateReturning.mockResolvedValue([]);

      const repo = new DrizzleUserRepository(db as unknown as RepoDb);

      const promise = repo.upsertByClerkId('clerk_1', 'new@example.com');
      await expect(promise).rejects.toBeInstanceOf(ApplicationError);
      await expect(promise).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    });

    it('throws INTERNAL_ERROR when user not found after conflict', async () => {
      const db = createDbMock();
      db._mocks.queryFindFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      db._mocks.insertReturning.mockResolvedValue([]);

      const repo = new DrizzleUserRepository(db as unknown as RepoDb);

      const promise = repo.upsertByClerkId('clerk_1', 'a@example.com');
      await expect(promise).rejects.toBeInstanceOf(ApplicationError);
      await expect(promise).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    });

    it('maps Postgres unique violations to CONFLICT', async () => {
      const db = createDbMock();
      const existing = {
        id: 'user_1',
        clerkUserId: 'clerk_1',
        email: 'old@example.com',
        createdAt: new Date('2026-02-01T00:00:00Z'),
        updatedAt: new Date('2026-02-01T00:00:00Z'),
      };

      db._mocks.queryFindFirst.mockResolvedValue(existing);
      db._mocks.updateReturning.mockRejectedValue({ code: '23505' });

      const repo = new DrizzleUserRepository(db as unknown as RepoDb);

      const promise = repo.upsertByClerkId('clerk_1', 'new@example.com');
      await expect(promise).rejects.toBeInstanceOf(ApplicationError);
      await expect(promise).rejects.toMatchObject({ code: 'CONFLICT' });
    });
  });
});
