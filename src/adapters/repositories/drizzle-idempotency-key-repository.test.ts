import { drizzle } from 'drizzle-orm/postgres-js';
import { PostgresJsPreparedQuery } from 'drizzle-orm/postgres-js/session';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import { DrizzleIdempotencyKeyRepository } from './drizzle-idempotency-key-repository';

const repo = new DrizzleIdempotencyKeyRepository(drizzle.mock({ schema }));

// Only the input guard that never reaches the database belongs here. Claim,
// find, store, abort and prune behavior is covered against real Postgres in
// tests/integration/idempotency-key-repository.integration.test.ts.
beforeEach(() => {
  vi.spyOn(PostgresJsPreparedQuery.prototype, 'execute');
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('DrizzleIdempotencyKeyRepository input guards', () => {
  it.each([0, -1, 1.5, Number.NaN])(
    'returns 0 from pruneExpiredBefore without a query when limit is %s',
    async (limit) => {
      await expect(
        repo.pruneExpiredBefore(new Date('2026-02-08T00:00:00.000Z'), limit),
      ).resolves.toBe(0);
      expect(PostgresJsPreparedQuery.prototype.execute).not.toHaveBeenCalled();
    },
  );
});
