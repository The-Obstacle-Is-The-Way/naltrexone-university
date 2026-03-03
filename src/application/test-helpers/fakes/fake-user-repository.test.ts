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
    it('creates new user when not exists', async () => {
      const repo = new FakeUserRepository();
      const user = await repo.upsertByClerkId('clerk-123', 'test@example.com');

      expect(user.id).toMatch(/^user-\d+$/);
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

    it('migrates clerkUserId when different clerkId arrives for existing email', async () => {
      const repo = new FakeUserRepository();

      const first = await repo.upsertByClerkId('clerk-1', 'user@example.com');
      const second = await repo.upsertByClerkId('clerk-2', 'user@example.com');

      expect(second.id).toBe(first.id);
      expect(second.email).toBe('user@example.com');
      await expect(repo.findByClerkId('clerk-2')).resolves.toMatchObject({
        id: first.id,
      });
      await expect(repo.findByClerkId('clerk-1')).resolves.toBeNull();
    });

    it('preserves clerkUserId when stale observedAt arrives for email conflict', async () => {
      const repo = new FakeUserRepository();
      const t2 = new Date('2026-02-01T02:00:00.000Z');
      const t1 = new Date('2026-02-01T01:00:00.000Z');

      const first = await repo.upsertByClerkId('clerk-1', 'user@example.com', {
        observedAt: t2,
      });
      const stale = await repo.upsertByClerkId('clerk-2', 'user@example.com', {
        observedAt: t1,
      });

      expect(stale.id).toBe(first.id);
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
        message: 'User could not be upserted due to a uniqueness constraint',
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
