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
import { DrizzlePracticeSessionRepository } from './drizzle-practice-session-repository';

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

const repo = new DrizzlePracticeSessionRepository(drizzle.mock({ schema }));

function createSession() {
  return repo.create({
    userId: crypto.randomUUID(),
    mode: 'tutor',
    paramsJson: {
      count: 1,
      tagSlugs: [],
      difficulties: [],
      questionIds: [crypto.randomUUID()],
    },
  });
}

// Only driver responses that real Postgres cannot produce belong here: an
// INSERT ... RETURNING with no row and an arbitrary driver failure inside the
// create transaction. The write's behavior (validation guard, the real
// duplicate-incomplete-session constraint, discard scoping, end() with its
// clock, snapshot, guarded-update fallbacks and fake parity) runs against real
// Postgres in tests/integration/practice-session-writes.integration.test.ts
// and tests/integration/session-attempt-repository.integration.test.ts.
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

describe('DrizzlePracticeSessionRepository create error translation', () => {
  it('wraps an unexpected insert failure in INTERNAL_ERROR with its cause', async () => {
    const cause = new Error('db offline');
    vi.mocked(PostgresJsPreparedQuery.prototype.execute).mockRejectedValueOnce(
      cause,
    );

    const promise = createSession();

    await expect(promise).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Failed to create practice session',
      cause,
    });
    expect(PostgresJsPreparedQuery.prototype.execute).toHaveBeenCalledTimes(1);
  });

  it('throws INTERNAL_ERROR when the session insert returns no row and skips the state insert', async () => {
    vi.mocked(PostgresJsPreparedQuery.prototype.execute).mockResolvedValueOnce(
      [],
    );

    await expect(createSession()).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Failed to create practice session',
    });
    expect(PostgresJsPreparedQuery.prototype.execute).toHaveBeenCalledTimes(1);
  });
});
