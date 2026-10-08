import { drizzle } from 'drizzle-orm/postgres-js';
import { PostgresJsPreparedQuery } from 'drizzle-orm/postgres-js/session';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import { DrizzleRateLimiter } from './drizzle-rate-limiter';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DrizzleRateLimiter error translation', () => {
  it('throws INTERNAL_ERROR when rate-limit upsert returns no row', async () => {
    // A successful PostgreSQL upsert always returns its row. Inject only this
    // impossible driver response; all counter/cleanup behavior runs in Postgres.
    vi.spyOn(
      PostgresJsPreparedQuery.prototype,
      'execute',
    ).mockResolvedValueOnce([]);
    const limiter = new DrizzleRateLimiter(
      drizzle.mock({ schema }),
      () => new Date('2000-01-03T12:00:00Z'),
    );
    const result = limiter.limit({
      key: 'rate:test',
      limit: 5,
      windowMs: 60_000,
    });
    await expect(result).rejects.toBeInstanceOf(ApplicationError);
    await expect(result).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Failed to update rate-limit counter',
    });
  });
});

// DEBT-505: a counter is pruned once its window started more than a day ago,
// so a longer window would forget its count while still open and let every
// call through. Refuse it before touching the database.
describe('DrizzleRateLimiter window bound', () => {
  it('refuses a window longer than the one day its rows are kept', async () => {
    const execute = vi.spyOn(PostgresJsPreparedQuery.prototype, 'execute');
    const limiter = new DrizzleRateLimiter(drizzle.mock({ schema }));

    await expect(
      limiter.limit({ key: 'rate:test', limit: 1, windowMs: 86_400_001 }),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(execute).not.toHaveBeenCalled();
  });
});
