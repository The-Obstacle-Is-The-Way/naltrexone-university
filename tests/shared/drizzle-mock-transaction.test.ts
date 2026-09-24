import { sql } from 'drizzle-orm';
import { PgTransaction } from 'drizzle-orm/pg-core';
import { drizzle, PostgresJsPreparedQuery } from 'drizzle-orm/postgres-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import { installMockTransactionBoundary } from './drizzle-mock-transaction';

const db = drizzle.mock({ schema });

beforeEach(() => {
  installMockTransactionBoundary();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('installMockTransactionBoundary', () => {
  it('runs transaction callbacks on a stub transaction whose statements reach the spied boundary', async () => {
    vi.mocked(PostgresJsPreparedQuery.prototype.execute).mockResolvedValueOnce([
      { one: 1 },
    ]);

    const seen: unknown[] = [];
    const result = await db.transaction(async (tx) => {
      seen.push(tx);
      return tx.execute(sql`select 1 as one`);
    });

    expect(seen[0]).toBeInstanceOf(PgTransaction);
    expect(result).toEqual([{ one: 1 }]);
    expect(PostgresJsPreparedQuery.prototype.execute).toHaveBeenCalledTimes(1);
  });

  it('runs nested transaction callbacks on the same stub transaction', async () => {
    const seen: unknown[] = [];

    await db.transaction(async (tx) => {
      seen.push(tx);
      await tx.transaction(async (inner) => {
        seen.push(inner);
      });
    });

    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(seen[0]);
    expect(PostgresJsPreparedQuery.prototype.execute).not.toHaveBeenCalled();
  });
});
