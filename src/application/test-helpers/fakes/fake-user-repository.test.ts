import { describe, expect, it } from 'vitest';
import { FakeUserRepository } from './fake-user-repository';

describe('FakeUserRepository', () => {
  describe('findByClerkId', () => {
    it('returns null when user not found', async () => {
      const repo = new FakeUserRepository();
      const result = await repo.findByClerkId('clerk-123');
      expect(result).toBeNull();
    });

    it('returns user when found', async () => {
      const repo = new FakeUserRepository();
      await repo.upsertByClerkId('clerk-123', 'test@example.com');

      const result = await repo.findByClerkId('clerk-123');

      expect(result).not.toBeNull();
      expect(result?.email).toBe('test@example.com');
    });
  });

  describe('upsertByClerkId', () => {
    it.each([
      'upsertByClerkId',
      'updateEmailByClerkId',
    ] as const)('ignores a stale existing-identity write to a foreign-owned email through %s', async (operation) => {
      const repo = new FakeUserRepository();
      const staleObservedAt = new Date('2026-02-01T00:00:00.000Z');
      const currentObservedAt = new Date('2026-02-02T00:00:00.000Z');
      await repo.upsertByClerkId('clerk-owner', 'owned@example.com', {
        observedAt: currentObservedAt,
      });
      const incoming = await repo.upsertByClerkId(
        'clerk-incoming',
        'incoming@example.com',
        { observedAt: currentObservedAt },
      );

      await expect(
        repo[operation]('clerk-incoming', 'owned@example.com', {
          observedAt: staleObservedAt,
        }),
      ).resolves.toEqual(incoming);
      await expect(repo.findByClerkId('clerk-incoming')).resolves.toEqual(
        incoming,
      );
    });

    it.each([
      'upsertByClerkId',
      'updateEmailByClerkId',
    ] as const)('stores the newer observation timestamp for a same-email write through %s', async (operation) => {
      const repo = new FakeUserRepository();
      const initialObservedAt = new Date('2026-02-01T00:00:00.000Z');
      const newerObservedAt = new Date('2026-02-02T00:00:00.000Z');
      const existing = await repo.upsertByClerkId(
        'clerk-1',
        'user@example.com',
        { observedAt: initialObservedAt },
      );

      await expect(
        repo[operation]('clerk-1', 'user@example.com', {
          observedAt: newerObservedAt,
        }),
      ).resolves.toMatchObject({
        id: existing.id,
        email: 'user@example.com',
        updatedAt: newerObservedAt,
      });
      await expect(repo.findByClerkId('clerk-1')).resolves.toMatchObject({
        id: existing.id,
        email: 'user@example.com',
        updatedAt: newerObservedAt,
      });
    });

    it('creates new user when not exists', async () => {
      const repo = new FakeUserRepository();
      const user = await repo.upsertByClerkId('clerk-123', 'test@example.com');

      expect(user.id).toEqual(expect.any(String));
      expect(user.id.length).toBeGreaterThan(0);
      expect(user.email).toBe('test@example.com');
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
    });

    it('returns existing user when email matches', async () => {
      const repo = new FakeUserRepository();
      const first = await repo.upsertByClerkId('clerk-123', 'test@example.com');
      const second = await repo.upsertByClerkId(
        'clerk-123',
        'test@example.com',
      );

      expect(second.id).toBe(first.id);
      expect(second.email).toBe(first.email);
    });

    it('updates email when different', async () => {
      const repo = new FakeUserRepository();
      const first = await repo.upsertByClerkId('clerk-123', 'old@example.com');
      const second = await repo.upsertByClerkId('clerk-123', 'new@example.com');

      expect(second.id).toBe(first.id);
      expect(second.email).toBe('new@example.com');
    });

    it('rejects a different Clerk identity for an existing email without mutating either identity', async () => {
      const repo = new FakeUserRepository();

      const first = await repo.upsertByClerkId('clerk-1', 'user@example.com');
      await expect(
        repo.upsertByClerkId('clerk-2', 'user@example.com'),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        existingClerkUserId: 'clerk-1',
        details: {
          reason: 'user_email_owned_by_another_identity',
        },
      });
      await expect(repo.findByClerkId('clerk-1')).resolves.toMatchObject({
        id: first.id,
        email: 'user@example.com',
      });
      await expect(repo.findByClerkId('clerk-2')).resolves.toBeNull();
    });

    it('rejects stale cross-identity observations instead of returning the other identity', async () => {
      const repo = new FakeUserRepository();
      const t2 = new Date('2026-02-01T02:00:00.000Z');
      const t1 = new Date('2026-02-01T01:00:00.000Z');

      const first = await repo.upsertByClerkId('clerk-1', 'user@example.com', {
        observedAt: t2,
      });
      await expect(
        repo.upsertByClerkId('clerk-2', 'user@example.com', {
          observedAt: t1,
        }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        existingClerkUserId: 'clerk-1',
      });
      await expect(repo.findByClerkId('clerk-1')).resolves.toMatchObject({
        id: first.id,
      });
      await expect(repo.findByClerkId('clerk-2')).resolves.toBeNull();
    });

    it('throws CONFLICT when migrating email to a clerkId already used by another user', async () => {
      const repo = new FakeUserRepository();
      const t1 = new Date('2026-02-01T01:00:00.000Z');
      const t2 = new Date('2026-02-01T02:00:00.000Z');

      const userA = await repo.upsertByClerkId('clerk-1', 'a@example.com', {
        observedAt: t1,
      });
      const userB = await repo.upsertByClerkId('clerk-2', 'b@example.com', {
        observedAt: t1,
      });

      await expect(
        repo.upsertByClerkId('clerk-2', 'a@example.com', { observedAt: t2 }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        existingClerkUserId: 'clerk-1',
        details: {
          reason: 'user_email_owned_by_another_identity',
        },
      });

      await expect(repo.findByClerkId('clerk-1')).resolves.toMatchObject({
        id: userA.id,
        email: 'a@example.com',
      });
      await expect(repo.findByClerkId('clerk-2')).resolves.toMatchObject({
        id: userB.id,
        email: 'b@example.com',
      });
    });

    it('synchronizes an existing identity email without inserting a missing identity', async () => {
      const repo = new FakeUserRepository();
      const t1 = new Date('2026-02-01T01:00:00.000Z');
      const t2 = new Date('2026-02-01T02:00:00.000Z');
      const original = await repo.upsertByClerkId(
        'clerk-1',
        'old@example.com',
        { observedAt: t1 },
      );

      await expect(
        repo.updateEmailByClerkId('clerk-1', 'new@example.com', {
          observedAt: t2,
        }),
      ).resolves.toMatchObject({
        id: original.id,
        email: 'new@example.com',
        updatedAt: t2,
      });
      await expect(
        repo.updateEmailByClerkId('clerk-missing', 'new@example.com', {
          observedAt: t2,
        }),
      ).resolves.toBeNull();
    });

    it('rejects synchronizing an email owned by another identity', async () => {
      const repo = new FakeUserRepository();
      const initialObservedAt = new Date('2026-02-01T00:00:00.000Z');
      const observedAt = new Date('2026-02-02T00:00:00.000Z');
      const first = await repo.upsertByClerkId('clerk-1', 'first@example.com', {
        observedAt: initialObservedAt,
      });
      const second = await repo.upsertByClerkId(
        'clerk-2',
        'second@example.com',
        { observedAt: initialObservedAt },
      );

      await expect(
        repo.updateEmailByClerkId('clerk-2', 'first@example.com', {
          observedAt,
        }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        existingClerkUserId: 'clerk-1',
      });
      await expect(repo.findByClerkId('clerk-1')).resolves.toEqual(first);
      await expect(repo.findByClerkId('clerk-2')).resolves.toEqual(second);
    });

    it('ignores a stale synchronization even when the requested email belongs to another identity', async () => {
      const repo = new FakeUserRepository();
      const newer = new Date('2026-02-02T00:00:00.000Z');
      const older = new Date('2026-02-01T00:00:00.000Z');
      await repo.upsertByClerkId('clerk-1', 'first@example.com', {
        observedAt: newer,
      });
      const second = await repo.upsertByClerkId(
        'clerk-2',
        'second@example.com',
        { observedAt: newer },
      );

      await expect(
        repo.updateEmailByClerkId('clerk-2', 'first@example.com', {
          observedAt: older,
        }),
      ).resolves.toEqual(second);
      await expect(repo.findByClerkId('clerk-2')).resolves.toEqual(second);
    });

    it('preserves a newer email observation during synchronization', async () => {
      const repo = new FakeUserRepository();
      const newer = new Date('2026-02-02T00:00:00.000Z');
      const older = new Date('2026-02-01T00:00:00.000Z');
      const existing = await repo.upsertByClerkId(
        'clerk-1',
        'current@example.com',
        { observedAt: newer },
      );

      await expect(
        repo.updateEmailByClerkId('clerk-1', 'stale@example.com', {
          observedAt: older,
        }),
      ).resolves.toEqual(existing);
      await expect(repo.findByClerkId('clerk-1')).resolves.toEqual(existing);
    });
  });

  describe('deleteByClerkId', () => {
    it('returns true when a user existed and was deleted', async () => {
      const repo = new FakeUserRepository();
      await repo.upsertByClerkId('clerk-1', 'user@example.com');

      await expect(repo.deleteByClerkId('clerk-1')).resolves.toBe(true);
      await expect(repo.findByClerkId('clerk-1')).resolves.toBeNull();
    });

    it('returns false when the user did not exist', async () => {
      const repo = new FakeUserRepository();

      await expect(repo.deleteByClerkId('missing')).resolves.toBe(false);
    });
  });
});
