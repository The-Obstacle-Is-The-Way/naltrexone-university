import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { rateLimits } from '@/db/schema';
import { DrizzleRateLimiter } from '@/src/adapters/gateways/drizzle-rate-limiter';
import { ApplicationError } from '@/src/application/errors';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
} from './helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();
const now = new Date('2000-01-03T12:00:00Z');
const cutoff = new Date('2000-01-02T12:00:00Z');
const expired = new Date(cutoff.getTime() - 1);
const limiter = new DrizzleRateLimiter(db, () => now);

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupAfterEach(db, cleanup);
});
afterAll(async () => {
  await closeConnection(sql);
});

function key(suffix = '') {
  const value = `it-rate-guards:${randomUUID()}:${suffix}`;
  cleanup.rateLimitKeys.push(value);
  return value;
}
async function rows() {
  return db
    .select()
    .from(rateLimits)
    .where(inArray(rateLimits.key, cleanup.rateLimitKeys));
}

describe('rate-limit guards and triggered cleanup against real Postgres', () => {
  it('prunes at most 100 windows older than 24 hours when a new counter is created', async () => {
    const expiredKeys = Array.from({ length: 101 }, () => key()).sort();
    const boundaryKey = key();
    await db
      .insert(rateLimits)
      .values([
        ...expiredKeys.map((key) => ({ key, windowStart: expired, count: 1 })),
        { key: boundaryKey, windowStart: cutoff, count: 1 },
      ]);
    const firstKey = key();
    await expect(
      limiter.limit({ key: firstKey, limit: 5, windowMs: 60_000 }),
    ).resolves.toEqual({
      success: true,
      limit: 5,
      remaining: 4,
      retryAfterSeconds: 60,
    });
    expect((await rows()).map((row) => row.key).sort()).toEqual(
      [expiredKeys[100], boundaryKey, firstKey].sort(),
    );
    const secondKey = key();
    await limiter.limit({ key: secondKey, limit: 5, windowMs: 60_000 });
    expect((await rows()).map((row) => row.key).sort()).toEqual(
      [boundaryKey, firstKey, secondKey].sort(),
    );
  });

  it('increments an existing counter without triggering another cleanup', async () => {
    const input = { key: key(), limit: 5, windowMs: 60_000 };
    await limiter.limit(input);
    const oldKey = key();
    await db
      .insert(rateLimits)
      .values({ key: oldKey, windowStart: expired, count: 1 });
    await expect(limiter.limit(input)).resolves.toMatchObject({
      success: true,
      remaining: 3,
    });
    expect(await rows()).toEqual(
      expect.arrayContaining([
        { key: input.key, windowStart: now, count: 2 },
        { key: oldKey, windowStart: expired, count: 1 },
      ]),
    );
  });

  it.each([
    { limit: 0, windowMs: 60_000 },
    { limit: -1, windowMs: 60_000 },
    { limit: 1.5, windowMs: 60_000 },
    { limit: 5, windowMs: 0 },
    { limit: 5, windowMs: -1 },
    { limit: 5, windowMs: 1.5 },
  ])(
    'returns the nonblocking result without a write for invalid input $limit / $windowMs',
    async (input) => {
      const insert = vi.spyOn(db, 'insert');
      await expect(limiter.limit({ key: key(), ...input })).resolves.toEqual({
        success: true,
        limit: input.limit,
        remaining: input.limit,
        retryAfterSeconds: 0,
      });
      expect(insert).not.toHaveBeenCalled();
    },
  );

  it.each([0, -1, 1.5])(
    'does not execute a prune statement for invalid limit %s',
    async (limit) => {
      const execute = vi.spyOn(db, 'execute');
      await expect(limiter.pruneExpiredWindows(cutoff, limit)).resolves.toBe(0);
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it('keeps the persisted counter and logs a warning when the prune statement fails', async () => {
    const logger = new FakeLogger();
    const failingPruneLimiter = new DrizzleRateLimiter(db, () => now, logger);
    const input = { key: key(), limit: 5, windowMs: 60_000 };
    // Fault injection affects only cleanup; the counter upsert still uses Postgres.
    vi.spyOn(db, 'execute').mockRejectedValueOnce(new Error('prune failed'));
    await expect(failingPruneLimiter.limit(input)).resolves.toEqual({
      success: true,
      limit: 5,
      remaining: 4,
      retryAfterSeconds: 60,
    });
    expect(await rows()).toEqual([
      { key: input.key, windowStart: now, count: 1 },
    ]);
    expect(logger.warnCalls).toEqual([
      {
        msg: 'Rate-limit window pruning failed',
        context: { ...input, error: 'prune failed' },
      },
    ]);
  });

  it('rejects a non-positive count returned by an increment of corrupted stored state', async () => {
    const input = { key: key(), limit: 5, windowMs: 60_000 };
    // The DB schema permits this value; the adapter must reject the resulting zero.
    await db
      .insert(rateLimits)
      .values({ key: input.key, windowStart: now, count: -1 });
    const result = limiter.limit(input);
    await expect(result).rejects.toBeInstanceOf(ApplicationError);
    await expect(result).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Failed to update rate-limit counter',
    });
  });

  it('deletes only the oldest key-window pair in one statement when keys and windows collide', async () => {
    const prefix = key();
    const firstKey = `${prefix}:a`;
    const secondKey = `${prefix}:b`;
    cleanup.rateLimitKeys.push(firstKey, secondKey);
    const olderWindow = new Date(expired.getTime() - 1_000);
    await db.insert(rateLimits).values([
      { key: firstKey, windowStart: expired, count: 1 },
      { key: secondKey, windowStart: olderWindow, count: 1 },
      { key: firstKey, windowStart: olderWindow, count: 1 },
    ]);
    const execute = vi.spyOn(db, 'execute');
    const transaction = vi.spyOn(db, 'transaction');
    await expect(limiter.pruneExpiredWindows(cutoff, 1)).resolves.toBe(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(transaction).not.toHaveBeenCalled();
    const remaining = await db
      .select()
      .from(rateLimits)
      .where(inArray(rateLimits.key, [firstKey, secondKey]));
    expect(remaining).toHaveLength(2);
    expect(remaining).toEqual(
      expect.arrayContaining([
        { key: firstKey, windowStart: expired, count: 1 },
        { key: secondKey, windowStart: olderWindow, count: 1 },
      ]),
    );
    await expect(
      db.select().from(rateLimits).where(eq(rateLimits.key, firstKey)),
    ).resolves.toEqual([{ key: firstKey, windowStart: expired, count: 1 }]);
  });
});
