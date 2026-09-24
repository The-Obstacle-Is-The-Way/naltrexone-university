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
import { isRollbackCertainPersistenceError } from '@/src/application/errors';
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

function markQuestion() {
  return repo.setQuestionMarkedForReview({
    sessionId: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    questionId: crypto.randomUUID(),
    markedForReview: true,
  });
}

// Only statement cancellation (SQLSTATE 57014), which real Postgres cannot
// raise deterministically inside this write, belongs here. The write's
// behavior (not-found, ended-session, missing-state, draft finalization and
// the optimistic retry loop) runs against real Postgres in
// tests/integration/practice-session-question-state-writes.integration.test.ts.
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

describe('DrizzlePracticeSessionRepository statement cancellation', () => {
  it('classifies transaction-body cancellation as rollback-certain for a mark write', async () => {
    const statementCancellation = new Error('canceling statement', {
      cause: { code: '57014' },
    });
    vi.mocked(PostgresJsPreparedQuery.prototype.execute).mockRejectedValueOnce(
      statementCancellation,
    );

    const promise = markQuestion();

    await expect(promise).rejects.toSatisfy(isRollbackCertainPersistenceError);
    await expect(promise).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      cause: statementCancellation,
    });
    expect(PostgresJsPreparedQuery.prototype.execute).toHaveBeenCalledTimes(1);
  });

  it('keeps transaction-boundary cancellation indeterminate for a mark write', async () => {
    const statementCancellation = new Error('commit canceled', {
      cause: { code: '57014' },
    });
    vi.mocked(PgDatabase.prototype.transaction).mockRejectedValueOnce(
      statementCancellation,
    );

    await expect(markQuestion()).rejects.toBe(statementCancellation);
    expect(PostgresJsPreparedQuery.prototype.execute).not.toHaveBeenCalled();
  });
});
