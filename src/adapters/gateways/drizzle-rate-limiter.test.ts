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
