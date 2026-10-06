import { PgRelationalQuery } from 'drizzle-orm/pg-core/query-builders/query';
import { drizzle, PostgresJsPreparedQuery } from 'drizzle-orm/postgres-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import {
  ApplicationError,
  UserEmailOwnershipConflictError,
} from '@/src/application/errors';
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

  // BUG-320: two first requests for one new user can insert at once. The
  // loser trips the email index; the row is its own, so it tries once more.
  // Inserts fail or answer at the prepared-query spy; the owner lookup is a
  // relational read, answered at its own execute().
  describe('an email conflict with the same user', () => {
    const emailConflict = { code: '23505', constraint_name: 'users_email_uq' };
    const row = {
      id: '0b9a3f9e-5d55-4bd5-9a52-4d3d0e6f8a11',
      clerkUserId: 'clerk_1',
      email: 'a@example.com',
      createdAt: new Date('2026-10-06T00:00:00Z'),
      updatedAt: new Date('2026-10-06T00:00:00Z'),
    };
    const ownerLookups = () => vi.spyOn(PgRelationalQuery.prototype, 'execute');

    it.each([
      ['its own row holds the email', { clerkUserId: 'clerk_1' }],
      ['no row holds it any more', undefined],
    ])('retries once when %s', async (_case, owner) => {
      const lookups = ownerLookups().mockResolvedValueOnce(owner);
      vi.mocked(PostgresJsPreparedQuery.prototype.execute)
        .mockRejectedValueOnce(emailConflict)
        .mockResolvedValueOnce([row]);

      await expect(
        repo.upsertByClerkId('clerk_1', 'a@example.com'),
      ).resolves.toMatchObject({ id: row.id, email: row.email });
      expect(PostgresJsPreparedQuery.prototype.execute).toHaveBeenCalledTimes(
        2,
      );
      expect(lookups).toHaveBeenCalledTimes(1);
    });

    it('gives up after one retry', async () => {
      const lookups = ownerLookups()
        .mockResolvedValueOnce({ clerkUserId: 'clerk_1' })
        .mockResolvedValueOnce({ clerkUserId: 'clerk_1' });
      vi.mocked(PostgresJsPreparedQuery.prototype.execute)
        .mockRejectedValueOnce(emailConflict)
        .mockRejectedValueOnce(emailConflict);

      await expect(
        repo.upsertByClerkId('clerk_1', 'a@example.com'),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(PostgresJsPreparedQuery.prototype.execute).toHaveBeenCalledTimes(
        2,
      );
      expect(lookups).toHaveBeenCalledTimes(2);
    });

    it('does not retry when another identity owns the email', async () => {
      ownerLookups().mockResolvedValueOnce({ clerkUserId: 'clerk_other' });
      vi.mocked(
        PostgresJsPreparedQuery.prototype.execute,
      ).mockRejectedValueOnce(emailConflict);

      await expect(
        repo.upsertByClerkId('clerk_1', 'a@example.com'),
      ).rejects.toBeInstanceOf(UserEmailOwnershipConflictError);
      expect(PostgresJsPreparedQuery.prototype.execute).toHaveBeenCalledTimes(
        1,
      );
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
