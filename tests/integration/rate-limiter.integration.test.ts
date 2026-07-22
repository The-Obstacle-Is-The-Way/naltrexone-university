import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { rateLimits } from '@/db/schema';
import { DrizzleRateLimiter } from '@/src/adapters/gateways/drizzle-rate-limiter';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
} from './helpers';

const { db, sql } = createIntegrationDb();
const lockHolder = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(lockHolder.sql);
  await closeConnection(sql);
});

describe('DrizzleRateLimiter', () => {
  it('increments within a window and rejects over the limit', async () => {
    const now = () => new Date('2026-02-01T00:00:01.500Z');
    const limiter = new DrizzleRateLimiter(db, now);
    const key = `it-rate:${randomUUID()}`;
    cleanup.rateLimitKeys.push(key);

    const input = { key, limit: 2, windowMs: 1000 };

    await expect(limiter.limit(input)).resolves.toMatchObject({
      success: true,
      remaining: 1,
      retryAfterSeconds: 1,
    });
    await expect(limiter.limit(input)).resolves.toMatchObject({
      success: true,
      remaining: 0,
      retryAfterSeconds: 1,
    });
    await expect(limiter.limit(input)).resolves.toMatchObject({
      success: false,
      remaining: 0,
      retryAfterSeconds: 1,
    });
  });

  it('prunes expired windows up to the batch limit and preserves live windows', async () => {
    const cutoff = new Date('2026-07-01T00:00:00.000Z');
    const keys = [
      `it-rate-prune-0:${randomUUID()}`,
      `it-rate-prune-1:${randomUUID()}`,
      `it-rate-prune-2:${randomUUID()}`,
      `it-rate-prune-3:${randomUUID()}`,
    ] as const;
    cleanup.rateLimitKeys.push(...keys);
    await db.insert(rateLimits).values([
      {
        key: keys[0],
        windowStart: new Date('2026-06-01T00:00:00.000Z'),
        count: 1,
      },
      {
        key: keys[1],
        windowStart: new Date('2026-06-02T00:00:00.000Z'),
        count: 1,
      },
      {
        key: keys[2],
        windowStart: new Date('2026-06-03T00:00:00.000Z'),
        count: 1,
      },
      {
        key: keys[3],
        windowStart: new Date('2026-07-01T00:00:00.000Z'),
        count: 1,
      },
    ]);
    const limiter = new DrizzleRateLimiter(db);

    await expect(limiter.pruneExpiredWindows(cutoff, 2)).resolves.toBe(2);

    const remaining = await db
      .select({ key: rateLimits.key })
      .from(rateLimits)
      .where(inArray(rateLimits.key, keys));
    expect(remaining.map((row) => row.key).sort()).toEqual(
      [keys[2], keys[3]].sort(),
    );
  });

  it('skips locked oldest windows and prunes later expired windows without waiting', async () => {
    const cutoff = new Date('2026-07-01T00:00:00.000Z');
    const keys = [
      `it-rate-prune-lock-0:${randomUUID()}`,
      `it-rate-prune-lock-1:${randomUUID()}`,
      `it-rate-prune-lock-2:${randomUUID()}`,
      `it-rate-prune-lock-3:${randomUUID()}`,
    ] as const;
    cleanup.rateLimitKeys.push(...keys);
    await db.insert(rateLimits).values(
      keys.map((key, index) => ({
        key,
        windowStart: new Date(
          `2026-06-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
        ),
        count: 1,
      })),
    );
    const lockReady = createDeferred<void>();
    const releaseLocks = createDeferred<void>();
    const holding = lockHolder.sql.begin(async (tx) => {
      await tx`
        select key, window_start
        from rate_limits
        where key in ${tx(keys)} and window_start < ${cutoff.toISOString()}
        order by window_start, key
        limit 2
        for update
      `;
      lockReady.resolve();
      await releaseLocks.promise;
    });
    void holding.catch((error: unknown) => {
      lockReady.reject(error);
    });
    await lockReady.promise;
    await sql`set lock_timeout = '1s'`;
    const pruning = new DrizzleRateLimiter(db).pruneExpiredWindows(cutoff, 2);

    try {
      await expect(pruning).resolves.toBe(2);

      const remaining = await db
        .select({ key: rateLimits.key })
        .from(rateLimits)
        .where(inArray(rateLimits.key, keys));
      expect(remaining.map((row) => row.key).sort()).toEqual(
        [keys[0], keys[1]].sort(),
      );
    } finally {
      releaseLocks.resolve();
      try {
        await holding;
      } finally {
        await sql`reset lock_timeout`;
      }
    }
  });
});
