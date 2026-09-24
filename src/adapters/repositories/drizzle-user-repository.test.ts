import { drizzle, PostgresJsPreparedQuery } from 'drizzle-orm/postgres-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import { installMockTransactionBoundary } from '@/tests/shared/drizzle-mock-transaction';
import { DrizzleUserRepository } from './drizzle-user-repository';

// Only driver-response and error translation that real Postgres cannot force
// belongs here. The real prepared-query boundary supplies the fault; SQL
// behavior (find, lock, upsert clock guard, email ownership conflicts, delete,
// advisory lock) and transaction commit/rollback are covered in
// tests/integration/user-repository.integration.test.ts.
const repo = new DrizzleUserRepository(drizzle.mock({ schema }));

beforeEach(() => {
  installMockTransactionBoundary();
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
    // The empty result must have come from the boundary, not from a wrapper
    // failure that never reached it.
    expect(PostgresJsPreparedQuery.prototype.execute).toHaveBeenCalledTimes(1);
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
    const databaseError = new Error('boom');
    vi.mocked(PostgresJsPreparedQuery.prototype.execute).mockRejectedValueOnce(
      databaseError,
    );

    await expect(
      repo.updateEmailByClerkId('clerk_1', 'new@example.com'),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR', cause: databaseError });
  });

  it('throws INTERNAL_ERROR when the delete query throws', async () => {
    const databaseError = new Error('boom');
    vi.mocked(PostgresJsPreparedQuery.prototype.execute).mockRejectedValueOnce(
      databaseError,
    );

    const promise = repo.deleteByClerkId('clerk_1');
    await expect(promise).rejects.toBeInstanceOf(ApplicationError);
    await expect(promise).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      cause: databaseError,
    });
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
