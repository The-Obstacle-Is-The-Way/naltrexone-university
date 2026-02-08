import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { DrizzleIdempotencyKeyRepository } from './drizzle-idempotency-key-repository';

type RepoDb = ConstructorParameters<typeof DrizzleIdempotencyKeyRepository>[0];

describe('DrizzleIdempotencyKeyRepository', () => {
  describe('claim', () => {
    it('returns true when insert succeeds', async () => {
      const insertReturning = vi.fn(async () => [{ key: 'idem-1' }]);
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

      const repo = new DrizzleIdempotencyKeyRepository(db);

      await expect(
        repo.claim({
          userId: '11111111-1111-1111-1111-111111111111',
          action: 'question:submitAnswer',
          key: 'idem-1',
          expiresAt: new Date('2026-02-08T01:00:00.000Z'),
        }),
      ).resolves.toBe(true);

      expect(update).not.toHaveBeenCalled();
    });

    it('returns true when an expired key is reclaimed', async () => {
      const insertReturning = vi.fn(async () => []);
      const insertOnConflictDoNothing = vi.fn(() => ({
        returning: insertReturning,
      }));
      const insertValues = vi.fn(() => ({
        onConflictDoNothing: insertOnConflictDoNothing,
      }));
      const insert = vi.fn(() => ({ values: insertValues }));

      const updateReturning = vi.fn(async () => [{ key: 'idem-1' }]);
      const updateWhere = vi.fn(() => ({ returning: updateReturning }));
      const updateSet = vi.fn(() => ({ where: updateWhere }));
      const update = vi.fn(() => ({ set: updateSet }));

      const db = {
        insert,
        update,
      } as unknown as RepoDb;

      const repo = new DrizzleIdempotencyKeyRepository(
        db,
        () => new Date('2026-02-08T00:00:00.000Z'),
      );

      await expect(
        repo.claim({
          userId: '11111111-1111-1111-1111-111111111111',
          action: 'question:submitAnswer',
          key: 'idem-1',
          expiresAt: new Date('2026-02-08T01:00:00.000Z'),
        }),
      ).resolves.toBe(true);
      expect(update).toHaveBeenCalledTimes(1);
    });

    it('returns false when existing key is still active', async () => {
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
      ).resolves.toBe(false);
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
      const selectWhere = vi.fn(async () => [
        {
          resultJson: { ok: true },
          errorCode: 'CONFLICT',
          errorMessage: 'already in progress',
          expiresAt,
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

      const db = {
        select,
        delete: deleteFn,
      } as unknown as RepoDb;

      const repo = new DrizzleIdempotencyKeyRepository(db);

      await expect(
        repo.pruneExpiredBefore(new Date('2026-02-08T00:00:00.000Z'), 100),
      ).resolves.toBe(0);

      expect(deleteFn).not.toHaveBeenCalled();
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

      const db = {
        select,
        delete: deleteFn,
      } as unknown as RepoDb;

      const repo = new DrizzleIdempotencyKeyRepository(db);

      await expect(
        repo.pruneExpiredBefore(new Date('2026-02-08T00:00:00.000Z'), 100),
      ).resolves.toBe(2);

      expect(deleteFn).toHaveBeenCalledTimes(1);
      expect(deleteWhere).toHaveBeenCalledTimes(1);
    });
  });
});
