import { describe, expect, it, vi } from 'vitest';
import { idempotencyKeys } from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import { DrizzleIdempotencyKeyRepository } from './drizzle-idempotency-key-repository';

type RepoDb = ConstructorParameters<typeof DrizzleIdempotencyKeyRepository>[0];

function collectColumnNamesForTable(
  node: unknown,
  table: unknown,
): readonly string[] {
  const names = new Set<string>();

  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') {
      return;
    }

    const maybeNode = value as {
      table?: unknown;
      name?: unknown;
      queryChunks?: unknown[];
    };

    if (maybeNode.table === table && typeof maybeNode.name === 'string') {
      names.add(maybeNode.name);
    }

    if (Array.isArray(maybeNode.queryChunks)) {
      for (const chunk of maybeNode.queryChunks) {
        visit(chunk);
      }
    }
  };

  visit(node);
  return [...names];
}

describe('DrizzleIdempotencyKeyRepository', () => {
  describe('claim', () => {
    it('returns the claimedAt token when insert succeeds', async () => {
      const now = new Date('2026-02-08T00:00:00.000Z');
      const insertReturning = vi.fn(async () => [{ claimedAt: now }]);
      const insertOnConflictDoNothing = vi.fn(() => ({
        returning: insertReturning,
      }));
      const insertValues = vi.fn(() => ({
        onConflictDoNothing: insertOnConflictDoNothing,
      }));
      const insert = vi.fn(() => ({ values: insertValues }));

      const update = vi.fn();

      const db = {
        insert,
        update,
      } as unknown as RepoDb;

      const repo = new DrizzleIdempotencyKeyRepository(db, () => now);

      await expect(
        repo.claim({
          userId: '11111111-1111-1111-1111-111111111111',
          action: 'question:submitAnswer',
          key: 'idem-1',
          expiresAt: new Date('2026-02-08T01:00:00.000Z'),
        }),
      ).resolves.toEqual(now);

      expect(update).not.toHaveBeenCalled();
      expect(insertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          completedAt: null,
        }),
      );
    });

    it('returns the claimedAt token when an expired key is reclaimed', async () => {
      const now = new Date('2026-02-08T00:00:00.000Z');
      const insertReturning = vi.fn(async () => []);
      const insertOnConflictDoNothing = vi.fn(() => ({
        returning: insertReturning,
      }));
      const insertValues = vi.fn(() => ({
        onConflictDoNothing: insertOnConflictDoNothing,
      }));
      const insert = vi.fn(() => ({ values: insertValues }));

      const updateReturning = vi.fn(async () => [{ claimedAt: now }]);
      const updateWhere = vi.fn(() => ({ returning: updateReturning }));
      const updateSet = vi.fn(() => ({ where: updateWhere }));
      const update = vi.fn(() => ({ set: updateSet }));

      const db = {
        insert,
        update,
      } as unknown as RepoDb;

      const repo = new DrizzleIdempotencyKeyRepository(db, () => now);

      await expect(
        repo.claim({
          userId: '11111111-1111-1111-1111-111111111111',
          action: 'question:submitAnswer',
          key: 'idem-1',
          expiresAt: new Date('2026-02-08T01:00:00.000Z'),
        }),
      ).resolves.toEqual(now);
      expect(update).toHaveBeenCalledTimes(1);
      expect(updateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          completedAt: null,
        }),
      );
    });

    it('returns the claimedAt token when a zombie key is reclaimed after the threshold', async () => {
      const insertReturning = vi.fn(async () => []);
      const insertOnConflictDoNothing = vi.fn(() => ({
        returning: insertReturning,
      }));
      const insertValues = vi.fn(() => ({
        onConflictDoNothing: insertOnConflictDoNothing,
      }));
      const insert = vi.fn(() => ({ values: insertValues }));

      const now = new Date('2026-02-08T00:02:00.000Z');
      const updateReturning = vi.fn(async () => [{ claimedAt: now }]);
      const updateWhere = vi.fn(() => ({ returning: updateReturning }));
      const updateSet = vi.fn(() => ({ where: updateWhere }));
      const update = vi.fn(() => ({ set: updateSet }));

      const db = {
        insert,
        update,
      } as unknown as RepoDb;

      const repo = new DrizzleIdempotencyKeyRepository(db, () => now);

      await expect(
        repo.claim({
          userId: '11111111-1111-1111-1111-111111111111',
          action: 'question:submitAnswer',
          key: 'idem-1',
          expiresAt: new Date('2026-02-08T01:00:00.000Z'),
          zombieThresholdMs: 60_000,
        }),
      ).resolves.toEqual(now);

      expect(update).toHaveBeenCalledTimes(1);
      expect(updateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          claimedAt: now,
          completedAt: null,
          errorCode: null,
        }),
      );

      const whereClause = (updateWhere.mock.calls as unknown[][])[0]?.[0];
      const idempotencyColumns = collectColumnNamesForTable(
        whereClause,
        idempotencyKeys,
      );
      expect(idempotencyColumns).toContain('claimed_at');
      expect(idempotencyColumns).toContain('completed_at');
      expect(idempotencyColumns).toContain('error_code');
    });

    it('returns null when existing key is still active', async () => {
      const insertReturning = vi.fn(async () => []);
      const insertOnConflictDoNothing = vi.fn(() => ({
        returning: insertReturning,
      }));
      const insertValues = vi.fn(() => ({
        onConflictDoNothing: insertOnConflictDoNothing,
      }));
      const insert = vi.fn(() => ({ values: insertValues }));

      const updateReturning = vi.fn(async () => []);
      const updateWhere = vi.fn(() => ({ returning: updateReturning }));
      const updateSet = vi.fn(() => ({ where: updateWhere }));
      const update = vi.fn(() => ({ set: updateSet }));

      const db = {
        insert,
        update,
      } as unknown as RepoDb;

      const repo = new DrizzleIdempotencyKeyRepository(db);

      await expect(
        repo.claim({
          userId: '11111111-1111-1111-1111-111111111111',
          action: 'question:submitAnswer',
          key: 'idem-1',
          expiresAt: new Date('2026-02-08T01:00:00.000Z'),
        }),
      ).resolves.toBeNull();
    });
  });

  describe('find', () => {
    it('returns null when key does not exist', async () => {
      const selectWhere = vi.fn(async () => []);
      const selectFrom = vi.fn(() => ({ where: selectWhere }));
      const select = vi.fn(() => ({ from: selectFrom }));

      const db = {
        select,
      } as unknown as RepoDb;

      const repo = new DrizzleIdempotencyKeyRepository(db);

      await expect(
        repo.find(
          '11111111-1111-1111-1111-111111111111',
          'question:submitAnswer',
          'idem-1',
        ),
      ).resolves.toBeNull();
    });

    it('returns null when key is expired', async () => {
      const selectWhere = vi.fn(async () => [
        {
          resultJson: { ok: true },
          errorCode: null,
          errorMessage: null,
          completedAt: new Date('2026-02-08T00:00:00.000Z'),
          expiresAt: new Date('2026-02-08T00:00:00.000Z'),
        },
      ]);
      const selectFrom = vi.fn(() => ({ where: selectWhere }));
      const select = vi.fn(() => ({ from: selectFrom }));

      const db = {
        select,
      } as unknown as RepoDb;

      const repo = new DrizzleIdempotencyKeyRepository(
        db,
        () => new Date('2026-02-08T00:00:01.000Z'),
      );

      await expect(
        repo.find(
          '11111111-1111-1111-1111-111111111111',
          'question:submitAnswer',
          'idem-1',
        ),
      ).resolves.toBeNull();
    });

    it('returns cached result and error payload for active keys', async () => {
      const expiresAt = new Date('2026-02-08T01:00:00.000Z');
      const completedAt = new Date('2026-02-08T00:00:00.000Z');
      const selectWhere = vi.fn(async () => [
        {
          resultJson: { ok: true },
          errorCode: 'CONFLICT',
          errorMessage: 'already in progress',
          expiresAt,
          completedAt,
        },
      ]);
      const selectFrom = vi.fn(() => ({ where: selectWhere }));
      const select = vi.fn(() => ({ from: selectFrom }));

      const db = {
        select,
      } as unknown as RepoDb;

      const repo = new DrizzleIdempotencyKeyRepository(
        db,
        () => new Date('2026-02-08T00:00:00.000Z'),
      );

      await expect(
        repo.find(
          '11111111-1111-1111-1111-111111111111',
          'question:submitAnswer',
          'idem-1',
        ),
      ).resolves.toEqual({
        resultJson: { ok: true },
        error: { code: 'CONFLICT', message: 'already in progress' },
        expiresAt,
        completedAt,
      });
    });

    it('returns completed records even when resultJson is null', async () => {
      const expiresAt = new Date('2026-02-08T01:00:00.000Z');
      const completedAt = new Date('2026-02-08T00:00:00.000Z');
      const selectWhere = vi.fn(async () => [
        {
          resultJson: null,
          errorCode: null,
          errorMessage: null,
          expiresAt,
          completedAt,
        },
      ]);
      const selectFrom = vi.fn(() => ({ where: selectWhere }));
      const select = vi.fn(() => ({ from: selectFrom }));

      const db = {
        select,
      } as unknown as RepoDb;

      const repo = new DrizzleIdempotencyKeyRepository(
        db,
        () => new Date('2026-02-08T00:00:00.000Z'),
      );

      await expect(
        repo.find(
          '11111111-1111-1111-1111-111111111111',
          'question:submitAnswer',
          'idem-1',
        ),
      ).resolves.toEqual({
        resultJson: null,
        error: null,
        expiresAt,
        completedAt,
      });
    });
  });

  describe('storeResult', () => {
    it('writes result payload for an existing claim', async () => {
      const updateReturning = vi.fn(async () => [{ key: 'idem-1' }]);
      const updateWhere = vi.fn(() => ({ returning: updateReturning }));
      const updateSet = vi.fn(() => ({ where: updateWhere }));
      const update = vi.fn(() => ({ set: updateSet }));

      const db = {
        update,
      } as unknown as RepoDb;

      const repo = new DrizzleIdempotencyKeyRepository(db);

      await expect(
        repo.storeResult({
          userId: '11111111-1111-1111-1111-111111111111',
          action: 'question:submitAnswer',
          key: 'idem-1',
          resultJson: { ok: true },
        }),
      ).resolves.toBeUndefined();
    });

    it('marks completedAt when storing result payloads', async () => {
      const updateReturning = vi.fn(async () => [{ key: 'idem-1' }]);
      const updateWhere = vi.fn(() => ({ returning: updateReturning }));
      const updateSet = vi.fn(() => ({ where: updateWhere }));
      const update = vi.fn(() => ({ set: updateSet }));
      const now = new Date('2026-02-08T00:00:00.000Z');

      const db = {
        update,
      } as unknown as RepoDb;

      const repo = new DrizzleIdempotencyKeyRepository(db, () => now);

      await repo.storeResult({
        userId: '11111111-1111-1111-1111-111111111111',
        action: 'question:submitAnswer',
        key: 'idem-1',
        resultJson: null,
      });

      expect(updateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          resultJson: null,
          errorCode: null,
          errorMessage: null,
          completedAt: now,
        }),
      );
    });

    it('throws NOT_FOUND when storing result for a missing claim', async () => {
      const updateReturning = vi.fn(async () => []);
      const updateWhere = vi.fn(() => ({ returning: updateReturning }));
      const updateSet = vi.fn(() => ({ where: updateWhere }));
      const update = vi.fn(() => ({ set: updateSet }));

      const db = {
        update,
      } as unknown as RepoDb;

      const repo = new DrizzleIdempotencyKeyRepository(db);

      await expect(
        repo.storeResult({
          userId: '11111111-1111-1111-1111-111111111111',
          action: 'question:submitAnswer',
          key: 'idem-1',
          resultJson: { ok: true },
        }),
      ).rejects.toEqual(
        new ApplicationError('NOT_FOUND', 'Idempotency key not found'),
      );
    });
  });

  describe('storeError', () => {
    it('writes error payload for an existing claim', async () => {
      const updateReturning = vi.fn(async () => [{ key: 'idem-1' }]);
      const updateWhere = vi.fn(() => ({ returning: updateReturning }));
      const updateSet = vi.fn(() => ({ where: updateWhere }));
      const update = vi.fn(() => ({ set: updateSet }));

      const db = {
        update,
      } as unknown as RepoDb;

      const repo = new DrizzleIdempotencyKeyRepository(db);

      await expect(
        repo.storeError({
          userId: '11111111-1111-1111-1111-111111111111',
          action: 'question:submitAnswer',
          key: 'idem-1',
          error: {
            code: 'INTERNAL_ERROR',
            message: 'unexpected failure',
          },
        }),
      ).resolves.toBeUndefined();
    });

    it('marks completedAt when storing error payloads', async () => {
      const updateReturning = vi.fn(async () => [{ key: 'idem-1' }]);
      const updateWhere = vi.fn(() => ({ returning: updateReturning }));
      const updateSet = vi.fn(() => ({ where: updateWhere }));
      const update = vi.fn(() => ({ set: updateSet }));
      const now = new Date('2026-02-08T00:00:00.000Z');

      const db = {
        update,
      } as unknown as RepoDb;

      const repo = new DrizzleIdempotencyKeyRepository(db, () => now);

      await repo.storeError({
        userId: '11111111-1111-1111-1111-111111111111',
        action: 'question:submitAnswer',
        key: 'idem-1',
        error: {
          code: 'INTERNAL_ERROR',
          message: 'unexpected failure',
        },
      });

      expect(updateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          resultJson: null,
          errorCode: 'INTERNAL_ERROR',
          errorMessage: 'unexpected failure',
          completedAt: now,
        }),
      );
    });

    it('throws NOT_FOUND when storing error for a missing claim', async () => {
      const updateReturning = vi.fn(async () => []);
      const updateWhere = vi.fn(() => ({ returning: updateReturning }));
      const updateSet = vi.fn(() => ({ where: updateWhere }));
      const update = vi.fn(() => ({ set: updateSet }));

      const db = {
        update,
      } as unknown as RepoDb;

      const repo = new DrizzleIdempotencyKeyRepository(db);

      await expect(
        repo.storeError({
          userId: '11111111-1111-1111-1111-111111111111',
          action: 'question:submitAnswer',
          key: 'idem-1',
          error: {
            code: 'INTERNAL_ERROR',
            message: 'unexpected failure',
          },
        }),
      ).rejects.toEqual(
        new ApplicationError('NOT_FOUND', 'Idempotency key not found'),
      );
    });
  });

  describe('pruneExpiredBefore', () => {
    it('returns 0 when limit is not a positive integer', async () => {
      const select = vi.fn();
      const deleteFn = vi.fn();

      const db = {
        select,
        delete: deleteFn,
      } as unknown as RepoDb;

      const repo = new DrizzleIdempotencyKeyRepository(db);

      await expect(
        repo.pruneExpiredBefore(new Date('2026-02-08T00:00:00.000Z'), 0),
      ).resolves.toBe(0);
      await expect(
        repo.pruneExpiredBefore(new Date('2026-02-08T00:00:00.000Z'), -1),
      ).resolves.toBe(0);
      await expect(
        repo.pruneExpiredBefore(new Date('2026-02-08T00:00:00.000Z'), 1.5),
      ).resolves.toBe(0);

      expect(select).not.toHaveBeenCalled();
      expect(deleteFn).not.toHaveBeenCalled();
    });

    it('returns 0 when no expired rows are found', async () => {
      const selectLimit = vi.fn(async () => []);
      const selectOrderBy = vi.fn(() => ({ limit: selectLimit }));
      const selectWhere = vi.fn(() => ({ orderBy: selectOrderBy }));
      const selectFrom = vi.fn(() => ({ where: selectWhere }));
      const select = vi.fn(() => ({ from: selectFrom }));

      const deleteFn = vi.fn();

      const tx = {
        select,
        delete: deleteFn,
      } as const;
      const transaction = vi.fn(
        async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
      );
      const db = {
        transaction,
        select: () => {
          throw new Error('unexpected root select');
        },
        delete: () => {
          throw new Error('unexpected root delete');
        },
      } as unknown as RepoDb;

      const repo = new DrizzleIdempotencyKeyRepository(db);

      await expect(
        repo.pruneExpiredBefore(new Date('2026-02-08T00:00:00.000Z'), 100),
      ).resolves.toBe(0);

      expect(deleteFn).not.toHaveBeenCalled();
      expect(transaction).toHaveBeenCalledTimes(1);
    });

    it('deletes up to limit expired rows and returns the count', async () => {
      const selectLimit = vi.fn(async () => [
        {
          userId: '11111111-1111-1111-1111-111111111111',
          action: 'question:submitAnswer',
          key: 'idem-1',
          expiresAt: new Date('2026-02-01T00:00:00.000Z'),
        },
        {
          userId: '11111111-1111-1111-1111-111111111111',
          action: 'question:submitAnswer',
          key: 'idem-2',
          expiresAt: new Date('2026-02-01T00:00:01.000Z'),
        },
      ]);
      const selectOrderBy = vi.fn(() => ({ limit: selectLimit }));
      const selectWhere = vi.fn(() => ({ orderBy: selectOrderBy }));
      const selectFrom = vi.fn(() => ({ where: selectWhere }));
      const select = vi.fn(() => ({ from: selectFrom }));

      const deleteReturning = vi.fn(async () => [
        { key: 'idem-1' },
        { key: 'idem-2' },
      ]);
      const deleteWhere = vi.fn(() => ({ returning: deleteReturning }));
      const deleteFn = vi.fn(() => ({ where: deleteWhere }));

      const tx = {
        select,
        delete: deleteFn,
      } as const;
      const transaction = vi.fn(
        async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
      );
      const db = {
        transaction,
        select: () => {
          throw new Error('unexpected root select');
        },
        delete: () => {
          throw new Error('unexpected root delete');
        },
      } as unknown as RepoDb;

      const repo = new DrizzleIdempotencyKeyRepository(db);

      await expect(
        repo.pruneExpiredBefore(new Date('2026-02-08T00:00:00.000Z'), 100),
      ).resolves.toBe(2);

      expect(deleteFn).toHaveBeenCalledTimes(1);
      expect(deleteWhere).toHaveBeenCalledTimes(1);
      expect(transaction).toHaveBeenCalledTimes(1);
    });

    it('includes expiration filter in delete conditions to prevent race with newly inserted keys', async () => {
      const cutoff = new Date('2026-02-08T00:00:00.000Z');
      const selectLimit = vi.fn(async () => [
        {
          userId: '11111111-1111-1111-1111-111111111111',
          action: 'question:submitAnswer',
          key: 'idem-1',
          expiresAt: new Date('2026-02-01T00:00:00.000Z'),
        },
      ]);
      const selectOrderBy = vi.fn(() => ({ limit: selectLimit }));
      const selectWhere = vi.fn(() => ({ orderBy: selectOrderBy }));
      const selectFrom = vi.fn(() => ({ where: selectWhere }));
      const select = vi.fn(() => ({ from: selectFrom }));

      const deleteReturning = vi.fn(async () => [{ key: 'idem-1' }]);
      const deleteWhere = vi.fn(() => ({ returning: deleteReturning }));
      const deleteFn = vi.fn(() => ({ where: deleteWhere }));

      const tx = {
        select,
        delete: deleteFn,
      } as const;
      const transaction = vi.fn(
        async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
      );
      const db = {
        transaction,
        select: () => {
          throw new Error('unexpected root select');
        },
        delete: () => {
          throw new Error('unexpected root delete');
        },
      } as unknown as RepoDb;

      const repo = new DrizzleIdempotencyKeyRepository(db);
      await repo.pruneExpiredBefore(cutoff, 10);
      expect(transaction).toHaveBeenCalledTimes(1);

      // The WHERE clause passed to delete must include the expiresAt < cutoff
      // filter alongside (userId, action, key) to prevent a race condition
      // where a non-expired key inserted between SELECT and DELETE would be
      // incorrectly deleted. We verify the condition's SQL representation
      // includes the expires_at column reference.
      const firstCall = deleteWhere.mock.calls[0] as unknown[];
      const whereArg = firstCall?.[0];
      expect(whereArg).toBeDefined();

      // NOTE: This helper intentionally couples to Drizzle's internal
      // condition-object shape to verify the atomic prune guard. It walks the
      // entire AST looking for a column reference named 'expires_at' in the
      // DELETE WHERE clause. If Drizzle changes its internal representation,
      // this test will break — that's acceptable because the guard is
      // safety-critical and must be re-verified after such changes.
      function containsExpiresAt(obj: unknown, depth = 0): boolean {
        if (depth > 20 || !obj || typeof obj !== 'object') return false;
        const record = obj as Record<string, unknown>;
        if (record.name === 'expires_at') return true;
        for (const value of Object.values(record)) {
          if (Array.isArray(value)) {
            if (value.some((item) => containsExpiresAt(item, depth + 1)))
              return true;
          } else if (containsExpiresAt(value, depth + 1)) {
            return true;
          }
        }
        return false;
      }
      expect(containsExpiresAt(whereArg)).toBe(true);
    });
  });
});
