import { drizzle } from 'drizzle-orm/postgres-js';
import { PostgresJsPreparedQuery } from 'drizzle-orm/postgres-js/session';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import { DrizzleBookmarkRepository } from './drizzle-bookmark-repository';

const repo = new DrizzleBookmarkRepository(drizzle.mock({ schema }));

// Only the impossible driver response belongs here: the real prepared-query
// boundary supplies it. Membership, upsert, removal and ordering behavior is
// covered against real Postgres in
// tests/integration/bookmark-repository.integration.test.ts.
beforeEach(() => {
  vi.spyOn(PostgresJsPreparedQuery.prototype, 'execute');
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('DrizzleBookmarkRepository error translation', () => {
  it('throws INTERNAL_ERROR when the bookmark upsert returns no rows', async () => {
    vi.mocked(PostgresJsPreparedQuery.prototype.execute).mockResolvedValueOnce(
      [],
    );

    const promise = repo.add(crypto.randomUUID(), crypto.randomUUID());
    await expect(promise).rejects.toBeInstanceOf(ApplicationError);
    await expect(promise).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});
