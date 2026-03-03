import { describe, expect, it, vi } from 'vitest';
import { FakeRateLimiter } from './fake-gateways';

describe('FakeRateLimiter', () => {
  describe('limit', () => {
    it('records input and returns default success when no scripted result exists', async () => {
      const limiter = new FakeRateLimiter();
      const input = { key: 'user:1', limit: 5, windowMs: 60_000 };

      await expect(limiter.limit(input)).resolves.toEqual({
        success: true,
        limit: 5,
        remaining: 4,
        retryAfterSeconds: 0,
      });

      expect(limiter.inputs).toEqual([input]);
      expect(limiter.windows.size).toBe(1);
    });

    it('returns scripted results in order before falling back to default behavior', async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date('2026-03-01T00:00:00.000Z'));

        const limiter = new FakeRateLimiter([
          { success: false, limit: 10, remaining: 0, retryAfterSeconds: 30 },
          { success: true, limit: 10, remaining: 9, retryAfterSeconds: 0 },
        ]);

        await expect(
          limiter.limit({ key: 'u1', limit: 10, windowMs: 60_000 }),
        ).resolves.toEqual({
          success: false,
          limit: 10,
          remaining: 0,
          retryAfterSeconds: 30,
        });

        await expect(
          limiter.limit({ key: 'u1', limit: 10, windowMs: 60_000 }),
        ).resolves.toEqual({
          success: true,
          limit: 10,
          remaining: 9,
          retryAfterSeconds: 0,
        });

        await expect(
          limiter.limit({ key: 'u1', limit: 3, windowMs: 60_000 }),
        ).resolves.toEqual({
          success: true,
          limit: 3,
          remaining: 2,
          retryAfterSeconds: 0,
        });

        expect(limiter.windows.size).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('throws scripted errors and still records the input', async () => {
      const error = new Error('rate limiter unavailable');
      const limiter = new FakeRateLimiter(error);
      const input = { key: 'user:1', limit: 2, windowMs: 1_000 };

      await expect(limiter.limit(input)).rejects.toBe(error);
      expect(limiter.inputs).toEqual([input]);
    });
  });

  describe('pruneExpiredWindows', () => {
    it('prunes oldest expired windows first up to the requested limit', async () => {
      vi.useFakeTimers();
      try {
        const limiter = new FakeRateLimiter();

        vi.setSystemTime(new Date('2026-03-01T00:00:00.000Z'));
        await limiter.limit({ key: 'ip:1', limit: 3, windowMs: 1_000 });

        vi.setSystemTime(new Date('2026-03-01T00:00:01.000Z'));
        await limiter.limit({ key: 'ip:1', limit: 3, windowMs: 1_000 });

        vi.setSystemTime(new Date('2026-03-01T00:00:02.000Z'));
        await limiter.limit({ key: 'ip:1', limit: 3, windowMs: 1_000 });

        await expect(
          limiter.pruneExpiredWindows(new Date('2026-03-01T00:00:01.500Z'), 2),
        ).resolves.toBe(2);

        expect(limiter.pruneCallCount).toBe(1);
        expect(
          Array.from(limiter.windows.values()).map((windowStart) =>
            windowStart.toISOString(),
          ),
        ).toEqual(['2026-03-01T00:00:02.000Z']);
      } finally {
        vi.useRealTimers();
      }
    });

    it('returns 0 for non-positive or non-integer limits', async () => {
      const limiter = new FakeRateLimiter();
      limiter.windows.set('ip:1:window', new Date('2026-03-01T00:00:00.000Z'));

      await expect(
        limiter.pruneExpiredWindows(new Date('2026-03-02T00:00:00.000Z'), 0),
      ).resolves.toBe(0);
      await expect(
        limiter.pruneExpiredWindows(new Date('2026-03-02T00:00:00.000Z'), -1),
      ).resolves.toBe(0);
      await expect(
        limiter.pruneExpiredWindows(new Date('2026-03-02T00:00:00.000Z'), 1.5),
      ).resolves.toBe(0);

      expect(limiter.pruneCallCount).toBe(3);
      expect(limiter.windows.size).toBe(1);
    });
  });
});
