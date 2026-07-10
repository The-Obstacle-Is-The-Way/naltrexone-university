// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DrizzleUserRepository } from '@/src/adapters/repositories/drizzle-user-repository';
import { ApplicationError } from '@/src/application/errors';

type RepoDb = ConstructorParameters<typeof DrizzleUserRepository>[0];

const userId = crypto.randomUUID();

function createDbMock() {
  const queryFindFirst = vi.fn();

  const insertReturning = vi.fn();
  const insertOnConflictDoUpdate = vi.fn(() => ({
    returning: insertReturning,
  }));
  const insertValues = vi.fn(() => ({
    onConflictDoUpdate: insertOnConflictDoUpdate,
  }));
  const insert = vi.fn(() => ({ values: insertValues }));

  const updateReturning = vi.fn();
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const updateFn = vi.fn(() => ({ set: updateSet }));

  const deleteReturning = vi.fn();
  const deleteWhere = vi.fn(() => ({ returning: deleteReturning }));
  const deleteFn = vi.fn(() => ({ where: deleteWhere }));

  const db = {
    query: {
      users: {
        findFirst: queryFindFirst,
      },
    },
    insert,
    update: updateFn,
    delete: deleteFn,
  } as const;
  const transaction = vi.fn(
    async <T>(fn: (tx: typeof db) => Promise<T>): Promise<T> => fn(db),
  );

  return {
    ...db,
    transaction,
    _mocks: {
      queryFindFirst,
      insertReturning,
      insertOnConflictDoUpdate,
      insertValues,
      updateReturning,
      updateWhere,
      updateSet,
      updateFn,
      deleteReturning,
      deleteWhere,
      deleteFn,
      transaction,
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
        id: userId,
        clerkUserId: 'clerk_1',
        email: 'a@example.com',
        createdAt: new Date('2026-02-01T00:00:00Z'),
        updatedAt: new Date('2026-02-01T00:00:00Z'),
      };
      db._mocks.queryFindFirst.mockResolvedValue(row);

      const repo = new DrizzleUserRepository(db as unknown as RepoDb);

      await expect(repo.findByClerkId('clerk_1')).resolves.toEqual({
        id: userId,
        email: 'a@example.com',
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
    });
  });

  describe('lockByClerkId', () => {
    it('returns null when the user does not exist', async () => {
      const db = {
        select: () => ({
          from: () => ({
            where: () => ({
              for: async () => [],
            }),
          }),
        }),
      } as const;

      const repo = new DrizzleUserRepository(db as unknown as RepoDb);

      await expect(repo.lockByClerkId('clerk_missing')).resolves.toBeNull();
    });

    it('locks and returns the user when found', async () => {
      const row = {
        id: userId,
        email: 'a@example.com',
        createdAt: new Date('2026-02-01T00:00:00Z'),
        updatedAt: new Date('2026-02-01T00:00:00Z'),
      };
      const forUpdate = vi.fn(async () => [row]);
      const where = vi.fn(() => ({ for: forUpdate }));
      const from = vi.fn(() => ({ where }));
      const select = vi.fn(() => ({ from }));

      const db = { select } as const;

      const repo = new DrizzleUserRepository(db as unknown as RepoDb);

      await expect(repo.lockByClerkId('clerk_1')).resolves.toEqual(row);
      expect(forUpdate).toHaveBeenCalledWith('update');
    });
  });

  describe('upsertByClerkId', () => {
    it('returns the user row returned by the upsert', async () => {
      vi.useFakeTimers();
      const now = new Date('2026-02-01T00:00:00Z');
      vi.setSystemTime(now);

      const db = createDbMock();
      const row = {
        id: userId,
        clerkUserId: 'clerk_1',
        email: 'a@example.com',
        createdAt: now,
        updatedAt: now,
      };
      db._mocks.insertReturning.mockResolvedValue([row]);

      const repo = new DrizzleUserRepository(db as unknown as RepoDb);

      await expect(
        repo.upsertByClerkId('clerk_1', 'a@example.com'),
      ).resolves.toEqual({
        id: row.id,
        email: row.email,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });

      expect(db._mocks.insertValues).toHaveBeenCalledWith({
        clerkUserId: 'clerk_1',
        email: 'a@example.com',
        createdAt: now,
        updatedAt: now,
      });
      expect(db._mocks.transaction).toHaveBeenCalledTimes(1);
    });

    it('uses observedAt for createdAt/updatedAt on insert values', async () => {
      const observedAt = new Date('2026-02-01T00:30:00Z');

      const db = createDbMock();
      const row = {
        id: userId,
        clerkUserId: 'clerk_1',
        email: 'a@example.com',
        createdAt: observedAt,
        updatedAt: observedAt,
      };
      db._mocks.insertReturning.mockResolvedValue([row]);

      const repo = new DrizzleUserRepository(db as unknown as RepoDb);

      await expect(
        repo.upsertByClerkId('clerk_1', 'a@example.com', { observedAt }),
      ).resolves.toEqual({
        id: row.id,
        email: row.email,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });

      expect(db._mocks.insertValues).toHaveBeenCalledWith({
        clerkUserId: 'clerk_1',
        email: 'a@example.com',
        createdAt: observedAt,
        updatedAt: observedAt,
      });
    });

    it('throws INTERNAL_ERROR when returning yields no rows', async () => {
      const db = createDbMock();
      db._mocks.insertReturning.mockResolvedValue([]);

      const repo = new DrizzleUserRepository(db as unknown as RepoDb);

      const promise = repo.upsertByClerkId('clerk_1', 'a@example.com');
      await expect(promise).rejects.toBeInstanceOf(ApplicationError);
      await expect(promise).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    });

    it('maps Postgres unique violations to CONFLICT', async () => {
      const db = createDbMock();
      db._mocks.insertReturning.mockRejectedValue({ code: '23505' });

      const repo = new DrizzleUserRepository(db as unknown as RepoDb);

      const promise = repo.upsertByClerkId('clerk_1', 'new@example.com');
      await expect(promise).rejects.toBeInstanceOf(ApplicationError);
      await expect(promise).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('maps unknown errors to INTERNAL_ERROR', async () => {
      const db = createDbMock();
      db._mocks.insertReturning.mockRejectedValue(new Error('boom'));

      const repo = new DrizzleUserRepository(db as unknown as RepoDb);

      const promise = repo.upsertByClerkId('clerk_1', 'new@example.com');
      await expect(promise).rejects.toBeInstanceOf(ApplicationError);
      await expect(promise).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    });

    it('returns a typed non-mutating conflict when another Clerk identity owns the email', async () => {
      const observedAt = new Date('2026-02-01T00:30:00Z');
      const db = createDbMock();
      const row = {
        id: userId,
        email: 'a@example.com',
        createdAt: new Date('2026-02-01T00:00:00Z'),
        updatedAt: observedAt,
      };
      db._mocks.insertReturning.mockRejectedValue({
        code: '23505',
        constraint: 'users_email_uq',
      });
      db._mocks.queryFindFirst.mockResolvedValue({
        clerkUserId: 'clerk_1',
      });
      db._mocks.updateReturning.mockResolvedValue([row]);

      const repo = new DrizzleUserRepository(db as unknown as RepoDb);

      const promise = repo.upsertByClerkId('clerk_2', 'a@example.com', {
        observedAt,
      });

      await expect(promise).rejects.toMatchObject({
        code: 'CONFLICT',
        existingClerkUserId: 'clerk_1',
        details: {
          reason: 'user_email_owned_by_another_identity',
        },
      });
      expect(db._mocks.updateFn).not.toHaveBeenCalled();
    });

    it('reports the current email owner when the incoming identity already owns another row', async () => {
      const db = createDbMock();
      db._mocks.insertReturning.mockRejectedValue({
        code: '23505',
        constraint: 'users_email_uq',
      });
      db._mocks.queryFindFirst.mockResolvedValue({
        clerkUserId: 'clerk_1',
      });

      const repo = new DrizzleUserRepository(db as unknown as RepoDb);

      const promise = repo.upsertByClerkId('clerk_2', 'a@example.com');
      await expect(promise).rejects.toBeInstanceOf(ApplicationError);
      await expect(promise).rejects.toMatchObject({
        code: 'CONFLICT',
        existingClerkUserId: 'clerk_1',
        details: {
          reason: 'user_email_owned_by_another_identity',
        },
      });
      expect(db._mocks.updateFn).not.toHaveBeenCalled();
    });
  });

  describe('deleteByClerkId', () => {
    it('returns false when no user row exists', async () => {
      const db = createDbMock();
      db._mocks.deleteReturning.mockResolvedValue([]);

      const repo = new DrizzleUserRepository(db as unknown as RepoDb);

      await expect(repo.deleteByClerkId('clerk_1')).resolves.toBe(false);
    });

    it('returns true when a user row is deleted', async () => {
      const db = createDbMock();
      db._mocks.deleteReturning.mockResolvedValue([{ id: userId }]);

      const repo = new DrizzleUserRepository(db as unknown as RepoDb);

      await expect(repo.deleteByClerkId('clerk_1')).resolves.toBe(true);
      expect(db._mocks.deleteFn).toHaveBeenCalledTimes(1);
    });

    it('throws INTERNAL_ERROR when delete query throws', async () => {
      const db = createDbMock();
      db._mocks.deleteFn.mockImplementation(() => {
        throw new Error('boom');
      });

      const repo = new DrizzleUserRepository(db as unknown as RepoDb);

      const promise = repo.deleteByClerkId('clerk_1');
      await expect(promise).rejects.toBeInstanceOf(ApplicationError);
      await expect(promise).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    });
  });
});
