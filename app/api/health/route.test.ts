import { describe, expect, it, vi } from 'vitest';
import { createHealthHandler } from '@/app/api/health/handler';
import {
  FakeLogger,
  FakeRateLimiter,
} from '@/src/application/test-helpers/fakes';

describe('POST /api/health', () => {
  it('returns ok=true when the database is reachable', async () => {
    const execute = vi.fn(async () => undefined);
    const logger = new FakeLogger();
    const rateLimiter = new FakeRateLimiter();
    const now = () => new Date('2026-02-04T00:00:00.000Z');

    const POST = createHealthHandler({
      db: { execute },
      logger,
      rateLimiter,
      now,
    });

    const res = await POST(
      new Request('http://localhost/api/health', {
        method: 'POST',
        headers: { 'x-vercel-forwarded-for': '198.51.100.9' },
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      db: true,
      timestamp: '2026-02-04T00:00:00.000Z',
    });
    expect(rateLimiter.inputs).toEqual([
      {
        key: 'health:198.51.100.9',
        limit: 600,
        windowMs: 60_000,
      },
    ]);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(logger.errorCalls).toHaveLength(0);
  });

  it('returns 500 and logs when the database is unreachable', async () => {
    const execute = vi.fn(async () => {
      throw new Error('db down');
    });
    const logger = new FakeLogger();
    const rateLimiter = new FakeRateLimiter();
    const now = () => new Date('2026-02-04T00:00:00.000Z');

    const POST = createHealthHandler({
      db: { execute },
      logger,
      rateLimiter,
      now,
    });

    const res = await POST(
      new Request('http://localhost/api/health', {
        method: 'POST',
        headers: { 'x-forwarded-for': '203.0.113.1' },
      }),
    );

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      error: 'Database connection failed',
    });
    expect(rateLimiter.inputs).toEqual([
      {
        key: 'health:203.0.113.1',
        limit: 600,
        windowMs: 60_000,
      },
    ]);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(logger.errorCalls).toHaveLength(1);
    expect(logger.errorCalls[0]).toEqual({
      context: { error: expect.any(Error) },
      msg: 'Health check failed',
    });
  });

  it('returns 429 when rate limit is exceeded', async () => {
    const execute = vi.fn(async () => undefined);
    const logger = new FakeLogger();
    const rateLimiter = new FakeRateLimiter({
      success: false,
      limit: 600,
      remaining: 0,
      retryAfterSeconds: 42,
    });
    const now = () => new Date('2026-02-04T00:00:00.000Z');

    const POST = createHealthHandler({
      db: { execute },
      logger,
      rateLimiter,
      now,
    });

    const res = await POST(
      new Request('http://localhost/api/health', {
        method: 'POST',
        headers: { 'x-real-ip': '203.0.113.2' },
      }),
    );

    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      error: 'Too many requests',
    });
    expect(res.headers.get('Retry-After')).toBe('42');
    expect(res.headers.get('X-RateLimit-Limit')).toBe('600');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(rateLimiter.inputs).toEqual([
      {
        key: 'health:203.0.113.2',
        limit: 600,
        windowMs: 60_000,
      },
    ]);
    expect(execute).toHaveBeenCalledTimes(0);
    expect(logger.errorCalls).toHaveLength(0);
  });

  it('returns 503 when the rate limiter fails', async () => {
    const execute = vi.fn(async () => undefined);
    const logger = new FakeLogger();
    const rateLimiter = new FakeRateLimiter(new Error('rate limiter down'));
    const now = () => new Date('2026-02-04T00:00:00.000Z');

    const POST = createHealthHandler({
      db: { execute },
      logger,
      rateLimiter,
      now,
    });

    const res = await POST(
      new Request('http://localhost/api/health', {
        method: 'POST',
      }),
    );

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      error: 'Rate limiter unavailable',
    });
    expect(rateLimiter.inputs).toEqual([
      {
        key: 'health:unknown',
        limit: 600,
        windowMs: 60_000,
      },
    ]);
    expect(execute).toHaveBeenCalledTimes(0);
    expect(logger.errorCalls).toHaveLength(1);
    expect(logger.errorCalls[0]).toEqual({
      context: { error: expect.any(Error) },
      msg: 'Health check rate limiter failed',
    });
  });
});
