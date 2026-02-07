import { describe, expect, it, vi } from 'vitest';
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
});
