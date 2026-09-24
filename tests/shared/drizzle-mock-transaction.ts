import {
  createTableRelationsHelpers,
  extractTablesRelationalConfig,
} from 'drizzle-orm';
import { PgDatabase, PgDialect, PgTransaction } from 'drizzle-orm/pg-core';
import {
  PostgresJsPreparedQuery,
  type PostgresJsQueryResultHKT,
} from 'drizzle-orm/postgres-js';
import { vi } from 'vitest';
import * as schema from '@/db/schema';

// Shared wiring for "impossible driver response" unit tests that run a
// repository on `drizzle.mock({ schema })`: the mock has no transactional
// client, so `transaction()` is answered by a real `PgTransaction` bound to
// the same mock session, and every statement still reaches the spied
// `PostgresJsPreparedQuery.execute` boundary where the test scripts its
// response. Behavior belongs on real Postgres in tests/integration; only
// error translation that real infrastructure cannot force belongs here.
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

/**
 * Spies the prepared-query boundary and routes `transaction()` callbacks
 * through a stub transaction on the mock session. Call from `beforeEach`;
 * restore with `vi.restoreAllMocks()` in `afterEach`.
 */
export function installMockTransactionBoundary(): void {
  vi.spyOn(PostgresJsPreparedQuery.prototype, 'execute');
  vi.spyOn(PgDatabase.prototype, 'transaction').mockImplementation(function (
    this: MockDatabase,
    transaction,
  ) {
    return transaction(
      new StubTransaction(new PgDialect(), this._.session, schemaConfig),
    );
  });
}
