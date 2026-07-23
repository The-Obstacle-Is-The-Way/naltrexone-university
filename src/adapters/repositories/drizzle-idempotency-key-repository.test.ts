import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import { idempotencyKeys } from '@/db/schema';
import {
  ApplicationError,
  PracticeSessionConflictReasons,
} from '@/src/application/errors';
import { DrizzleIdempotencyKeyRepository } from './drizzle-idempotency-key-repository';
import { collectColumnNamesForTable } from './repository-test-helpers';

type RepoDb = ConstructorParameters<typeof DrizzleIdempotencyKeyRepository>[0];

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

    it('returns validated cached error details for active keys', async () => {
      const expiresAt = new Date('2026-02-08T01:00:00.000Z');
      const completedAt = new Date('2026-02-08T00:00:00.000Z');
      const selectWhere = vi.fn(async () => [
        {
          resultJson: null,
          errorCode: 'CONFLICT',
          errorMessage: 'Practice session already ended',
          errorFieldErrors: {
            sessionId: ['Session is no longer active'],
          },
          errorDetails: {
            reason: PracticeSessionConflictReasons.AlreadyEnded,
          },
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
        error: {
          code: 'CONFLICT',
          message: 'Practice session already ended',
          fieldErrors: {
            sessionId: ['Session is no longer active'],
          },
          details: {
            reason: PracticeSessionConflictReasons.AlreadyEnded,
          },
        },
        expiresAt,
        completedAt,
      });
    });

    it('fails loudly with a cause when cached error details are invalid', async () => {
      const expiresAt = new Date('2026-02-08T01:00:00.000Z');
      const completedAt = new Date('2026-02-08T00:00:00.000Z');
      const selectWhere = vi.fn(async () => [
        {
          resultJson: null,
          errorCode: 'CONFLICT',
          errorMessage: 'Practice session already ended',
          errorDetails: {
            reason: 'not-a-known-reason',
          },
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
      ).rejects.toMatchObject({
        code: 'INTERNAL_ERROR',
        cause: expect.any(Error),
      });
    });

    it('fails loudly with a cause when a cached error code is empty', async () => {
      const expiresAt = new Date('2026-02-08T01:00:00.000Z');
      const completedAt = new Date('2026-02-08T00:00:00.000Z');
      const selectWhere = vi.fn(async () => [
        {
          resultJson: null,
          errorCode: '',
          errorMessage: 'corrupt error',
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
      ).rejects.toMatchObject({
        code: 'INTERNAL_ERROR',
        cause: expect.any(Error),
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
          claimedAt: new Date('2026-02-08T00:00:00.000Z'),
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
        claimedAt: now,
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
          claimedAt: new Date('2026-02-08T00:00:00.000Z'),
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
          claimedAt: new Date('2026-02-08T00:00:00.000Z'),
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
        claimedAt: now,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'unexpected failure',
          fieldErrors: { sessionId: ['Session is no longer active'] },
          details: {
            reason: PracticeSessionConflictReasons.AlreadyEnded,
          },
        },
      });

      expect(updateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          resultJson: null,
          errorCode: 'INTERNAL_ERROR',
          errorMessage: 'Internal error',
          errorFieldErrors: {
            sessionId: ['Session is no longer active'],
          },
          errorDetails: {
            reason: PracticeSessionConflictReasons.AlreadyEnded,
          },
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
          claimedAt: new Date('2026-02-08T00:00:00.000Z'),
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
      const execute = vi.fn();

      const db = {
        execute,
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

      expect(execute).not.toHaveBeenCalled();
    });

    it('emits one bounded candidate-lock delete with deterministic primary-key ordering and cutoff guard', async () => {
      const execute = vi.fn(async (_statement: SQL) => [
        { key: 'idem-1' },
        { key: 'idem-2' },
      ]);
      const transaction = vi.fn();
      const db = {
        execute,
        transaction,
      } as unknown as RepoDb;
      const repo = new DrizzleIdempotencyKeyRepository(db);
      const cutoff = new Date('2026-02-08T00:00:00.000Z');

      await expect(repo.pruneExpiredBefore(cutoff, 2)).resolves.toBe(2);

      expect(transaction).not.toHaveBeenCalled();
      expect(execute).toHaveBeenCalledTimes(1);
      const statement = execute.mock.calls[0]?.[0] as SQL | undefined;
      expect(statement).toBeDefined();
      if (!statement) throw new Error('Expected prune SQL statement');
      const query = new PgDialect().sqlToQuery(statement);
      const normalizedSql = query.sql
        .replaceAll(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      expect(normalizedSql).toContain('with candidates as ( select');
      expect(normalizedSql).toContain(
        'order by "idempotency_keys"."expires_at", "idempotency_keys"."user_id", "idempotency_keys"."action", "idempotency_keys"."key" limit $2 for update skip locked',
      );
      expect(normalizedSql).toContain(
        'delete from "idempotency_keys" using candidates',
      );
      expect(normalizedSql).toContain(
        '"idempotency_keys"."user_id" = candidates.user_id',
      );
      expect(normalizedSql).toContain(
        '"idempotency_keys"."action" = candidates.action',
      );
      expect(normalizedSql).toContain(
        '"idempotency_keys"."key" = candidates.key',
      );
      expect(
        normalizedSql.match(/"idempotency_keys"\."expires_at" < /g),
      ).toHaveLength(2);
      expect(query.params).toEqual([
        cutoff.toISOString(),
        2,
        cutoff.toISOString(),
      ]);
    });
  });
});
