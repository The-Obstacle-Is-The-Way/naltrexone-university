import {
  createTableRelationsHelpers,
  extractTablesRelationalConfig,
} from 'drizzle-orm';
import { PgDatabase, PgDialect, PgTransaction } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import {
  PostgresJsPreparedQuery,
  type PostgresJsQueryResultHKT,
} from 'drizzle-orm/postgres-js/session';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import { DrizzleUserRepository } from './drizzle-user-repository';

const relational = extractTablesRelationalConfig(
  schema,
  createTableRelationsHelpers,
);
const schemaConfig = {
  fullSchema: schema,
  schema: relational.tables,
  tableNamesMap: relational.tableNamesMap,
};
const repo = new DrizzleUserRepository(drizzle.mock({ schema }));
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

// Only driver-response and error translation that real Postgres cannot force
// belongs here. The real prepared-query boundary supplies the fault; SQL
// behavior (find, lock, upsert clock guard, email ownership conflicts, delete,
// advisory lock) and transaction commit/rollback are covered in
// tests/integration/user-repository.integration.test.ts.
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

describe('DrizzleUserRepository error translation', () => {
  it('throws INTERNAL_ERROR when the upsert returning clause yields no rows', async () => {
    vi.mocked(PostgresJsPreparedQuery.prototype.execute).mockResolvedValueOnce(
      [],
    );

    const promise = repo.upsertByClerkId('clerk_1', 'a@example.com');
    await expect(promise).rejects.toBeInstanceOf(ApplicationError);
    await expect(promise).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('maps a unique violation outside the email constraint to CONFLICT', async () => {
    vi.mocked(PostgresJsPreparedQuery.prototype.execute).mockRejectedValueOnce({
      code: '23505',
    });

    const promise = repo.upsertByClerkId('clerk_1', 'new@example.com');
    await expect(promise).rejects.toBeInstanceOf(ApplicationError);
    await expect(promise).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('maps an email unique violation whose owner lookup fails to INTERNAL_ERROR with the lookup cause', async () => {
    const lookupError = new Error('lookup boom');
    vi.mocked(PostgresJsPreparedQuery.prototype.execute)
      .mockRejectedValueOnce({
        code: '23505',
        constraint_name: 'users_email_uq',
      })
      .mockRejectedValueOnce(lookupError);

    const promise = repo.upsertByClerkId('clerk_2', 'a@example.com');
    await expect(promise).rejects.toBeInstanceOf(ApplicationError);
    await expect(promise).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      cause: lookupError,
    });
  });

  it('preserves unknown database errors as the INTERNAL_ERROR cause', async () => {
    const databaseError = new Error('boom');
    vi.mocked(PostgresJsPreparedQuery.prototype.execute).mockRejectedValueOnce(
      databaseError,
    );

    const promise = repo.upsertByClerkId('clerk_1', 'new@example.com');
    await expect(promise).rejects.toBeInstanceOf(ApplicationError);
    await expect(promise).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      cause: databaseError,
    });
  });

  it('maps email update persistence failures to INTERNAL_ERROR', async () => {
    vi.mocked(PostgresJsPreparedQuery.prototype.execute).mockRejectedValueOnce(
      new Error('boom'),
    );

    await expect(
      repo.updateEmailByClerkId('clerk_1', 'new@example.com'),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('throws INTERNAL_ERROR when the delete query throws', async () => {
    vi.mocked(PostgresJsPreparedQuery.prototype.execute).mockRejectedValueOnce(
      new Error('boom'),
    );

    const promise = repo.deleteByClerkId('clerk_1');
    await expect(promise).rejects.toBeInstanceOf(ApplicationError);
    await expect(promise).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('preserves the driver error as cause so deadlock SQLSTATEs stay observable', async () => {
    const deadlock = Object.assign(new Error('deadlock detected'), {
      code: '40P01',
    });
    vi.mocked(PostgresJsPreparedQuery.prototype.execute).mockRejectedValueOnce(
      deadlock,
    );

    await expect(repo.deleteByClerkId('clerk_1')).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      cause: deadlock,
    });
  });
});
