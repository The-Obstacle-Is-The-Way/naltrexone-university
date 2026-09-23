import { PostgresJsPreparedQuery } from 'drizzle-orm/postgres-js/session';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { idempotencyKeys } from '@/db/schema';
import { DrizzleIdempotencyKeyRepository } from '@/src/adapters/repositories/drizzle-idempotency-key-repository';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createUser,
} from './helpers';

// Guard-path twins for the retired call-chain units: active-key claims, absent
// and expired lookups, corrupt cached errors, and stores against missing
// claims. Split from idempotency-key-repository.integration.test.ts to respect
// the 800-line test-file policy (DEBT-469).
const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

describe('DrizzleIdempotencyKeyRepository guard paths', () => {
  it('returns null from claim while an unexpired key is still active', async () => {
    const user = await createUser(db, cleanup);
    const now = new Date('2026-02-01T00:00:00.000Z');
    const repo = new DrizzleIdempotencyKeyRepository(db, () => now);
    const expiresAt = new Date('2026-02-02T00:00:00.000Z');

    await expect(
      repo.claim({ userId: user.id, action: 'it:active', key: 'k', expiresAt }),
    ).resolves.toEqual(now);
    await expect(
      repo.claim({ userId: user.id, action: 'it:active', key: 'k', expiresAt }),
    ).resolves.toBeNull();
  });

  it('returns null from find for an absent key', async () => {
    const user = await createUser(db, cleanup);
    const repo = new DrizzleIdempotencyKeyRepository(
      db,
      () => new Date('2026-02-08T00:00:00.000Z'),
    );

    await expect(
      repo.find(user.id, 'it:absent', 'missing'),
    ).resolves.toBeNull();
  });

  it('returns null from find for an expired key', async () => {
    const user = await createUser(db, cleanup);
    const now = new Date('2026-02-08T00:00:00.000Z');
    const repo = new DrizzleIdempotencyKeyRepository(db, () => now);
    await db.insert(idempotencyKeys).values({
      userId: user.id,
      action: 'it:expired',
      key: 'k',
      resultJson: { ok: true },
      completedAt: new Date('2026-02-01T00:00:00.000Z'),
      expiresAt: new Date('2026-02-07T00:00:00.000Z'),
    });

    await expect(repo.find(user.id, 'it:expired', 'k')).resolves.toBeNull();
  });

  it('fails loudly on a cached error row whose code is empty', async () => {
    const user = await createUser(db, cleanup);
    const completedAt = new Date('2026-02-01T00:00:00.000Z');
    await db.insert(idempotencyKeys).values({
      userId: user.id,
      action: 'it:corrupt-code',
      key: 'empty-code',
      errorCode: '',
      errorMessage: 'corrupt error',
      completedAt,
      expiresAt: new Date('2026-02-02T00:00:00.000Z'),
    });
    const repo = new DrizzleIdempotencyKeyRepository(db, () => completedAt);

    await expect(
      repo.find(user.id, 'it:corrupt-code', 'empty-code'),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      cause: expect.any(Error),
    });
  });

  it.each(['storeResult', 'storeError'] as const)(
    'throws NOT_FOUND when %s targets a claim that does not exist',
    async (operation) => {
      const user = await createUser(db, cleanup);
      const now = new Date('2026-02-01T00:00:00.000Z');
      const repo = new DrizzleIdempotencyKeyRepository(db, () => now);
      const base = {
        userId: user.id,
        action: 'it:missing',
        key: 'k',
        claimedAt: now,
      };

      await expect(
        operation === 'storeResult'
          ? repo.storeResult({ ...base, resultJson: { ok: true } })
          : repo.storeError({
              ...base,
              error: { code: 'CONFLICT', message: 'Conflict' },
            }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    },
  );

  it.each([0, -1, 1.5, Number.NaN])(
    'returns 0 from pruneExpiredBefore without touching the database when limit is %s',
    async (limit) => {
      const execute = vi.spyOn(PostgresJsPreparedQuery.prototype, 'execute');
      const repo = new DrizzleIdempotencyKeyRepository(db);

      await expect(
        repo.pruneExpiredBefore(new Date('2026-02-08T00:00:00.000Z'), limit),
      ).resolves.toBe(0);
      expect(execute).not.toHaveBeenCalled();
    },
  );
});
