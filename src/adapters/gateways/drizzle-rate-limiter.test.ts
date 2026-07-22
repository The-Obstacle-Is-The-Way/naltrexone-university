import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
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
  it('uses the 24-hour target cutoff when a new rate-limit window is created', async () => {
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

    const cutoff = new Date(now.getTime() - 1_440 * 60_000);
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

  it('throws INTERNAL_ERROR when rate-limit upsert returns no row', async () => {
    const returning = vi.fn(async () => []);
    const onConflictDoUpdate = vi.fn(() => ({ returning }));
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    const insert = vi.fn(() => ({ values }));

    const db = {
      insert,
    } as const;

    const rateLimiter = new DrizzleRateLimiter(
      db as unknown as RateLimiterDb,
      () => new Date('2026-02-07T12:00:00.000Z'),
    );

    await expect(
      rateLimiter.limit({ key: 'rate:test', limit: 5, windowMs: 60_000 }),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });

  it('throws INTERNAL_ERROR when rate-limit upsert returns a non-positive count', async () => {
    const db = createDbMock(0);
    const rateLimiter = new DrizzleRateLimiter(
      db as unknown as RateLimiterDb,
      () => new Date('2026-02-07T12:00:00.000Z'),
    );

    await expect(
      rateLimiter.limit({ key: 'rate:test', limit: 5, windowMs: 60_000 }),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
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

  it('emits one bounded candidate-lock delete ordered and joined by window start and key', async () => {
    const cutoff = new Date('2026-02-07T12:00:00.000Z');
    const execute = vi.fn(async (_statement: SQL) => [{ key: 'rate:test' }]);
    const transaction = vi.fn();
    const db = {
      execute,
      transaction,
    } as unknown as RateLimiterDb;

    const rateLimiter = new DrizzleRateLimiter(
      db,
      () => new Date('2026-02-07T12:00:00.000Z'),
    );

    await expect(rateLimiter.pruneExpiredWindows(cutoff, 1)).resolves.toBe(1);
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
      'order by "rate_limits"."window_start", "rate_limits"."key" limit $2 for update skip locked',
    );
    expect(normalizedSql).toContain(
      'delete from "rate_limits" using candidates',
    );
    expect(normalizedSql).toContain('"rate_limits"."key" = candidates.key');
    expect(normalizedSql).toContain(
      '"rate_limits"."window_start" = candidates.window_start',
    );
    expect(query.params).toEqual([cutoff.toISOString(), 1]);
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
