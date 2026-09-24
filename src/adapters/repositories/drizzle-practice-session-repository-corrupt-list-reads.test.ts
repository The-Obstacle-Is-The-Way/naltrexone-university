import {
  createTableRelationsHelpers,
  extractTablesRelationalConfig,
} from 'drizzle-orm';
import { PgDatabase, PgDialect, PgTransaction } from 'drizzle-orm/pg-core';
import { RelationalQueryBuilder } from 'drizzle-orm/pg-core/query-builders/query';
import {
  drizzle,
  PostgresJsPreparedQuery,
  type PostgresJsQueryResultHKT,
} from 'drizzle-orm/postgres-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
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

// Only an arbitrary driver failure inside the corrupt-row classification,
// which real Postgres cannot raise on demand, belongs here: the relational
// session read is answered at the query-builder boundary and the following
// state-rows read fails at the prepared-query boundary. Corrupt-row skipping
// and logging run against real Postgres in
// tests/integration/practice-session-schema-hardening.integration.test.ts and
// tests/integration/practice-session-reads.integration.test.ts.
beforeEach(() => {
  vi.spyOn(PostgresJsPreparedQuery.prototype, 'execute');
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

describe('DrizzlePracticeSessionRepository corrupt-row classification', () => {
  it('propagates an unrelated driver failure raised while mapping a session instead of logging it as a corrupt row', async () => {
    const logger = new FakeLogger();
    const repo = new DrizzlePracticeSessionRepository(
      drizzle.mock({ schema }),
      undefined,
      logger,
    );
    const row: typeof schema.practiceSessions.$inferSelect = {
      id: crypto.randomUUID(),
      userId: crypto.randomUUID(),
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [crypto.randomUUID()],
      },
      startedAt: new Date('2026-03-05T10:00:00.000Z'),
      endedAt: null,
    };
    vi.spyOn(RelationalQueryBuilder.prototype, 'findFirst').mockReturnValueOnce(
      Promise.resolve(row) as never,
    );
    const failure = new Error('connection reset');
    vi.mocked(PostgresJsPreparedQuery.prototype.execute).mockRejectedValueOnce(
      failure,
    );

    await expect(repo.findLatestIncompleteByUserId(row.userId)).rejects.toBe(
      failure,
    );
    expect(logger.warnCalls).toEqual([]);
    expect(PostgresJsPreparedQuery.prototype.execute).toHaveBeenCalledTimes(1);
  });
});
