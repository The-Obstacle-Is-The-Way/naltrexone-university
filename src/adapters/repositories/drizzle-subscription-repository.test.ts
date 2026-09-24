import {
  createTableRelationsHelpers,
  extractTablesRelationalConfig,
} from 'drizzle-orm';
import { PgDatabase, PgDialect, PgTransaction } from 'drizzle-orm/pg-core';
import {
  drizzle,
  PostgresJsPreparedQuery,
  type PostgresJsQueryResultHKT,
} from 'drizzle-orm/postgres-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import { DrizzleSubscriptionRepository } from './drizzle-subscription-repository';

const relational = extractTablesRelationalConfig(
  schema,
  createTableRelationsHelpers,
);
const schemaConfig = {
  fullSchema: schema,
  schema: relational.tables,
  tableNamesMap: relational.tableNamesMap,
};
type MockDatabase = PgDatabase<
  PostgresJsQueryResultHKT,
  typeof schema,
  typeof relational.tables
>;

class StubTransaction extends PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  typeof relational.tables
> {
  override transaction<T>(
    transaction: (tx: StubTransaction) => Promise<T>,
  ): Promise<T> {
    return transaction(this);
  }
}

const repo = new DrizzleSubscriptionRepository(drizzle.mock({ schema }), {
  monthly: 'price_monthly',
  annual: 'price_annual',
});

function upsert() {
  return repo.upsert({
    userId: crypto.randomUUID(),
    externalSubscriptionId: 'sub_123',
    plan: 'monthly',
    status: 'active',
    currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
    cancelAtPeriodEnd: false,
    expectedVersion: null,
  });
}

// Inside the upsert transaction the advisory lock, the FOR UPDATE read and the
// insert each reach the prepared-query boundary in that order; the first two
// are answered and the third carries the failure under test.
function failInsertWith(failure: unknown) {
  vi.mocked(PostgresJsPreparedQuery.prototype.execute)
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockRejectedValueOnce(failure);
}

// Only error translation that real Postgres cannot force belongs here: the
// nested-cause shape of a driver error, a foreign-key violation on a
// constraint this table does not have, and an arbitrary driver failure. Real
// lookups, the price mapping, the injected clock, the real users foreign key
// and the real unique constraints run in tests/integration/
// subscription-repository.integration.test.ts and stripe-repositories.integration.test.ts.
beforeEach(() => {
  vi.spyOn(PostgresJsPreparedQuery.prototype, 'execute');
  // drizzle.mock has no transactional client, so run the callback on a
  // transaction bound to the same mock session; queries inside it still reach
  // the spied prepared-query boundary above.
  vi.spyOn(PgDatabase.prototype, 'transaction').mockImplementation(function (
    this: MockDatabase,
    transaction,
  ) {
    return transaction(
      new StubTransaction(new PgDialect(), this._.session, schemaConfig),
    );
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DrizzleSubscriptionRepository upsert error translation', () => {
  it('throws typed user_missing for the exact users foreign-key violation through a cause chain', async () => {
    const dbError = new Error('insert failed', {
      cause: {
        cause: {
          code: '23503',
          constraint: 'stripe_subscriptions_user_id_users_id_fk',
        },
      },
    });
    failInsertWith(dbError);

    await expect(upsert()).rejects.toMatchObject({
      reason: 'user_missing',
      cause: dbError,
    });
    expect(PostgresJsPreparedQuery.prototype.execute).toHaveBeenCalledTimes(3);
  });

  it('keeps a different foreign-key violation classified as INTERNAL_ERROR', async () => {
    const dbError = new Error('insert failed', {
      cause: { cause: { code: '23503', constraint: 'some_other_user_id_fk' } },
    });
    failInsertWith(dbError);

    await expect(upsert()).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      cause: dbError,
    });
  });

  it('wraps an unexpected database failure during upsert in INTERNAL_ERROR with its cause', async () => {
    const dbError = new Error('db down');
    failInsertWith(dbError);

    await expect(upsert()).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      cause: dbError,
    });
  });
});
