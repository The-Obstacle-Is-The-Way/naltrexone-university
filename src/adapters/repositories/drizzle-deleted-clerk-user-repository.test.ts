import { describe, expect, it, vi } from 'vitest';
import { deletedClerkUsers } from '@/db/schema';
import { DrizzleDeletedClerkUserRepository } from './drizzle-deleted-clerk-user-repository';

type RepoDb = ConstructorParameters<
  typeof DrizzleDeletedClerkUserRepository
>[0];

describe('DrizzleDeletedClerkUserRepository', () => {
  it('returns false when no tombstone exists', async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      }),
    } as const;

    const repo = new DrizzleDeletedClerkUserRepository(db as unknown as RepoDb);

    await expect(repo.exists('clerk_missing')).resolves.toBe(false);
  });

  it('returns true when a tombstone exists', async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ clerkUserId: 'clerk_1' }],
          }),
        }),
      }),
    } as const;

    const repo = new DrizzleDeletedClerkUserRepository(db as unknown as RepoDb);

    await expect(repo.exists('clerk_1')).resolves.toBe(true);
  });

  it('marks deleted users idempotently', async () => {
    const deletedAt = new Date('2026-02-01T00:00:00.000Z');
    const onConflictDoNothing = vi.fn(async () => undefined);
    const insertValues = vi.fn(() => ({
      onConflictDoNothing,
    }));

    const db = {
      insert: () => ({
        values: insertValues,
      }),
    } as const;

    const repo = new DrizzleDeletedClerkUserRepository(db as unknown as RepoDb);

    await expect(
      repo.markDeleted('clerk_1', deletedAt),
    ).resolves.toBeUndefined();
    expect(insertValues).toHaveBeenCalledWith({
      clerkUserId: 'clerk_1',
      deletedAt,
    });
    expect(onConflictDoNothing).toHaveBeenCalledWith({
      target: deletedClerkUsers.clerkUserId,
    });
  });

  it('uses the database default timestamp when deletedAt is omitted', async () => {
    const onConflictDoNothing = vi.fn(async () => undefined);
    const insertValues = vi.fn(() => ({
      onConflictDoNothing,
    }));

    const db = {
      insert: () => ({
        values: insertValues,
      }),
    } as const;

    const repo = new DrizzleDeletedClerkUserRepository(db as unknown as RepoDb);

    await expect(repo.markDeleted('clerk_1')).resolves.toBeUndefined();
    expect(insertValues).toHaveBeenCalledWith({
      clerkUserId: 'clerk_1',
    });
  });
});
