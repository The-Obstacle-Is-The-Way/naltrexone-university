import { describe, expect, it, vi } from 'vitest';
import { createHealthHandler } from '@/app/api/health/handler';
import { FakeLogger } from '@/src/application/test-helpers/fakes';

describe('POST /api/health', () => {
  it('returns ok=true when the database is reachable', async () => {
    const execute = vi.fn(async () => undefined);
    const logger = new FakeLogger();
    const now = () => new Date('2026-02-04T00:00:00.000Z');

    const POST = createHealthHandler({
      db: { execute },
      logger,
      now,
    });

    const res = await POST();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      db: true,
      timestamp: '2026-02-04T00:00:00.000Z',
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(logger.errorCalls).toHaveLength(0);
  });

  it('returns 500 and logs when the database is unreachable', async () => {
    const execute = vi.fn(async () => {
      throw new Error('db down');
    });
    const logger = new FakeLogger();
    const now = () => new Date('2026-02-04T00:00:00.000Z');

    const POST = createHealthHandler({
      db: { execute },
      logger,
      now,
    });

    const res = await POST();

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      error: 'Database connection failed',
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(logger.errorCalls).toHaveLength(1);
    expect(logger.errorCalls[0]).toEqual({
      context: { error: expect.any(Error) },
      msg: 'Health check failed',
    });
  });
});
