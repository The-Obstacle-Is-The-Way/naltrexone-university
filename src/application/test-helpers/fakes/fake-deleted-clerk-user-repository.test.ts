import { describe, expect, it } from 'vitest';
import { FakeDeletedClerkUserRepository } from './fake-deleted-clerk-user-repository';

describe('FakeDeletedClerkUserRepository', () => {
  it('allows transaction-scoped lock calls', async () => {
    const repo = new FakeDeletedClerkUserRepository();

    await expect(repo.lock('clerk_1')).resolves.toBeUndefined();
  });

  it('tracks deleted Clerk user ids', async () => {
    const repo = new FakeDeletedClerkUserRepository();

    await expect(repo.exists('clerk_1')).resolves.toBe(false);

    await repo.markDeleted('clerk_1', new Date('2026-02-01T00:00:00Z'));

    await expect(repo.exists('clerk_1')).resolves.toBe(true);
  });

  it('restores snapshots', async () => {
    const repo = new FakeDeletedClerkUserRepository();
    await repo.markDeleted('clerk_1', new Date('2026-02-01T00:00:00Z'));

    const snapshot = repo.snapshot();

    await repo.markDeleted('clerk_2', new Date('2026-02-02T00:00:00Z'));
    repo.restore(snapshot);

    await expect(repo.exists('clerk_1')).resolves.toBe(true);
    await expect(repo.exists('clerk_2')).resolves.toBe(false);
  });
});
