import { describe, expect, it, vi } from 'vitest';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { DrizzleRateLimiter } from './drizzle-rate-limiter';

type RateLimiterDb = ConstructorParameters<typeof DrizzleRateLimiter>[0];

function createDbMock(count: number) {
  const returning = vi.fn(async () => [{ count }]);
  const onConflictDoUpdate = vi.fn(() => ({ returning }));
  const values = vi.fn(() => ({ onConflictDoUpdate }));
  const insert = vi.fn(() => ({ values }));

  return {
    insert,
    _mocks: {
      insert,
      values,
      onConflictDoUpdate,
      returning,
    },
  } as const;
}

describe('DrizzleRateLimiter', () => {
  it('prunes expired windows when a new rate-limit window is created', async () => {
    const now = new Date('2026-02-07T12:00:00.000Z');
    const db = createDbMock(1);
    const rateLimiter = new DrizzleRateLimiter(
      db as unknown as RateLimiterDb,
      () => now,
    );
    const pruneSpy = vi
      .spyOn(rateLimiter, 'pruneExpiredWindows')
      .mockResolvedValue(0);

    await expect(
      rateLimiter.limit({ key: 'rate:test', limit: 5, windowMs: 60_000 }),
    ).resolves.toMatchObject({
      success: true,
      limit: 5,
      remaining: 4,
    });

    const cutoff = new Date(now.getTime() - 90 * 86_400_000);
    expect(pruneSpy).toHaveBeenCalledWith(cutoff, 100);
  });

  it('does not prune when the existing window row is only incremented', async () => {
    const db = createDbMock(2);
    const rateLimiter = new DrizzleRateLimiter(
      db as unknown as RateLimiterDb,
      () => new Date('2026-02-07T12:00:00.000Z'),
    );
    const pruneSpy = vi
      .spyOn(rateLimiter, 'pruneExpiredWindows')
      .mockResolvedValue(0);

    await rateLimiter.limit({ key: 'rate:test', limit: 5, windowMs: 60_000 });

    expect(pruneSpy).not.toHaveBeenCalled();
  });

  it('still returns a rate-limit result when pruning fails', async () => {
    const db = createDbMock(1);
    const rateLimiter = new DrizzleRateLimiter(
      db as unknown as RateLimiterDb,
      () => new Date('2026-02-07T12:00:00.000Z'),
    );
    vi.spyOn(rateLimiter, 'pruneExpiredWindows').mockRejectedValue(
      new Error('prune failed'),
    );

    await expect(
      rateLimiter.limit({ key: 'rate:test', limit: 5, windowMs: 60_000 }),
    ).resolves.toMatchObject({
      success: true,
      limit: 5,
      remaining: 4,
    });
  });

  it('logs a warning when pruning fails', async () => {
    const db = createDbMock(1);
    const logger = new FakeLogger();
    const rateLimiter = new DrizzleRateLimiter(
      db as unknown as RateLimiterDb,
      () => new Date('2026-02-07T12:00:00.000Z'),
      logger,
    );
    vi.spyOn(rateLimiter, 'pruneExpiredWindows').mockRejectedValue(
      new Error('prune failed'),
    );

    await rateLimiter.limit({ key: 'rate:test', limit: 5, windowMs: 60_000 });

    expect(logger.warnCalls).toHaveLength(1);
    expect(logger.warnCalls[0]).toMatchObject({
      msg: 'Rate-limit window pruning failed',
      context: {
        key: 'rate:test',
        limit: 5,
        windowMs: 60_000,
      },
    });
  });

  it('treats invalid limit inputs as non-blocking', async () => {
    const db = createDbMock(1);
    const rateLimiter = new DrizzleRateLimiter(
      db as unknown as RateLimiterDb,
      () => new Date('2026-02-07T12:00:00.000Z'),
    );

    await expect(
      rateLimiter.limit({ key: 'rate:test', limit: 0, windowMs: 60_000 }),
    ).resolves.toEqual({
      success: true,
      limit: 0,
      remaining: 0,
      retryAfterSeconds: 0,
    });
  });

  it('treats invalid windowMs inputs as non-blocking', async () => {
    const db = createDbMock(1);
    const rateLimiter = new DrizzleRateLimiter(
      db as unknown as RateLimiterDb,
      () => new Date('2026-02-07T12:00:00.000Z'),
    );

    await expect(
      rateLimiter.limit({ key: 'rate:test', limit: 5, windowMs: -1 }),
    ).resolves.toEqual({
      success: true,
      limit: 5,
      remaining: 5,
      retryAfterSeconds: 0,
    });
  });

  it('clamps remaining count to zero when usage exceeds limit', async () => {
    const db = createDbMock(7);
    const rateLimiter = new DrizzleRateLimiter(
      db as unknown as RateLimiterDb,
      () => new Date('2026-02-07T12:00:00.000Z'),
    );

    await expect(
      rateLimiter.limit({ key: 'rate:test', limit: 5, windowMs: 60_000 }),
    ).resolves.toEqual({
      success: false,
      limit: 5,
      remaining: 0,
      retryAfterSeconds: expect.any(Number),
    });
  });

  it('prunes expired windows inside a transaction and returns deleted count', async () => {
    const selectLimit = vi.fn(async () => [
      { key: 'rate:test', windowStart: new Date('2026-02-06T00:00:00.000Z') },
    ]);
    const selectOrderBy = vi.fn(() => ({ limit: selectLimit }));
    const selectWhere = vi.fn(() => ({ orderBy: selectOrderBy }));
    const selectFrom = vi.fn(() => ({ where: selectWhere }));
    const select = vi.fn(() => ({ from: selectFrom }));

    const deleteReturning = vi.fn(async () => [{ key: 'rate:test' }]);
    const deleteWhere = vi.fn(() => ({ returning: deleteReturning }));
    const deleteFn = vi.fn(() => ({ where: deleteWhere }));

    const tx = {
      select,
      delete: deleteFn,
      insert: vi.fn(() => {
        throw new Error('unexpected insert');
      }),
    } as const;
    const transaction = vi.fn(
      async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
    );
    const db = {
      ...tx,
      transaction,
    } as unknown as RateLimiterDb;

    const rateLimiter = new DrizzleRateLimiter(
      db,
      () => new Date('2026-02-07T12:00:00.000Z'),
    );

    await expect(
      rateLimiter.pruneExpiredWindows(new Date('2026-02-07T12:00:00.000Z'), 1),
    ).resolves.toBe(1);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(deleteFn).toHaveBeenCalledTimes(1);
  });

  it('returns zero when prune limit is zero', async () => {
    const db = createDbMock(1);
    const rateLimiter = new DrizzleRateLimiter(
      db as unknown as RateLimiterDb,
      () => new Date('2026-02-07T12:00:00.000Z'),
    );

    await expect(
      rateLimiter.pruneExpiredWindows(new Date('2026-02-07T12:00:00.000Z'), 0),
    ).resolves.toBe(0);
  });

  it('returns zero when prune limit is negative', async () => {
    const db = createDbMock(1);
    const rateLimiter = new DrizzleRateLimiter(
      db as unknown as RateLimiterDb,
      () => new Date('2026-02-07T12:00:00.000Z'),
    );

    await expect(
      rateLimiter.pruneExpiredWindows(new Date('2026-02-07T12:00:00.000Z'), -1),
    ).resolves.toBe(0);
  });
});
