import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { DrizzleUserRepository } from '@/src/adapters/repositories/drizzle-user-repository';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
} from './helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

describe('DrizzleUserRepository', () => {
  it('upserts users by clerk id and can find them', async () => {
    const repo = new DrizzleUserRepository(db);
    const clerkUserId = `user_${randomUUID().replaceAll('-', '')}`;
    const email = `it-${randomUUID()}@example.com`;

    const user = await repo.upsertByClerkId(clerkUserId, email);
    cleanup.userIds.push(user.id);

    await expect(repo.findByClerkId(clerkUserId)).resolves.toMatchObject({
      id: user.id,
      email,
    });
  });

  it('locks and returns an existing user inside a transaction', async () => {
    const repo = new DrizzleUserRepository(db);
    const clerkUserId = `user_${randomUUID().replaceAll('-', '')}`;
    const email = `it-${randomUUID()}@example.com`;

    const user = await repo.upsertByClerkId(clerkUserId, email);
    cleanup.userIds.push(user.id);

    await db.transaction(async (tx) => {
      const txRepo = new DrizzleUserRepository(tx);

      await expect(txRepo.lockByClerkId(clerkUserId)).resolves.toMatchObject({
        id: user.id,
        email,
      });
    });
  });

  it('applies observedAt clock-guard semantics when upserting', async () => {
    const repo = new DrizzleUserRepository(db);
    const clerkUserId = `user_${randomUUID().replaceAll('-', '')}`;

    const t1 = new Date('2026-02-01T00:00:00.000Z');
    const email1 = `it-${randomUUID()}@example.com`;
    const first = await repo.upsertByClerkId(clerkUserId, email1, {
      observedAt: t1,
    });
    cleanup.userIds.push(first.id);

    const t0 = new Date('2026-01-31T23:00:00.000Z');
    const email2 = `it-${randomUUID()}@example.com`;
    const stale = await repo.upsertByClerkId(clerkUserId, email2, {
      observedAt: t0,
    });
    expect(stale).toMatchObject({
      id: first.id,
      email: email1,
      createdAt: t1,
      updatedAt: t1,
    });

    const t2 = new Date('2026-02-01T01:00:00.000Z');
    const updated = await repo.upsertByClerkId(clerkUserId, email2, {
      observedAt: t2,
    });
    expect(updated).toMatchObject({
      id: first.id,
      email: email2,
      createdAt: t1,
      updatedAt: t2,
    });

    const t3 = new Date('2026-02-01T02:00:00.000Z');
    const bumped = await repo.upsertByClerkId(clerkUserId, email2, {
      observedAt: t3,
    });
    expect(bumped).toMatchObject({
      id: first.id,
      email: email2,
      createdAt: t1,
      updatedAt: t3,
    });
  });

  it('updates email when upserting an existing user', async () => {
    const repo = new DrizzleUserRepository(db);
    const clerkUserId = `user_${randomUUID().replaceAll('-', '')}`;

    const first = await repo.upsertByClerkId(
      clerkUserId,
      `it-${randomUUID()}@example.com`,
    );
    cleanup.userIds.push(first.id);

    const secondEmail = `it-${randomUUID()}@example.com`;
    const second = await repo.upsertByClerkId(clerkUserId, secondEmail);

    expect(second).toMatchObject({
      id: first.id,
      email: secondEmail,
    });
  });

  it('updates clerkUserId when a different clerkId arrives for the same email', async () => {
    const repo = new DrizzleUserRepository(db);
    const email = `it-${randomUUID()}@example.com`;
    const clerkId1 = `user_${randomUUID().replaceAll('-', '')}`;
    const clerkId2 = `user_${randomUUID().replaceAll('-', '')}`;

    const first = await repo.upsertByClerkId(clerkId1, email);
    cleanup.userIds.push(first.id);

    const second = await repo.upsertByClerkId(clerkId2, email);

    expect(second).toMatchObject({
      id: first.id,
      email,
    });

    await expect(repo.findByClerkId(clerkId2)).resolves.toMatchObject({
      id: first.id,
      email,
    });
    await expect(repo.findByClerkId(clerkId1)).resolves.toBeNull();
  });

  it('preserves existing clerkUserId when stale observedAt arrives during email conflict', async () => {
    const repo = new DrizzleUserRepository(db);
    const email = `it-${randomUUID()}@example.com`;
    const clerkId1 = `user_${randomUUID().replaceAll('-', '')}`;
    const clerkId2 = `user_${randomUUID().replaceAll('-', '')}`;
    const t2 = new Date('2026-02-01T02:00:00.000Z');
    const t1 = new Date('2026-02-01T01:00:00.000Z');

    const first = await repo.upsertByClerkId(clerkId1, email, {
      observedAt: t2,
    });
    cleanup.userIds.push(first.id);

    const stale = await repo.upsertByClerkId(clerkId2, email, {
      observedAt: t1,
    });

    expect(stale).toMatchObject({
      id: first.id,
      email,
      createdAt: t2,
      updatedAt: t2,
    });

    await expect(repo.findByClerkId(clerkId1)).resolves.toMatchObject({
      id: first.id,
      email,
    });
    await expect(repo.findByClerkId(clerkId2)).resolves.toBeNull();
  });

  it('deletes by clerk id and returns false when missing', async () => {
    const repo = new DrizzleUserRepository(db);
    await expect(repo.deleteByClerkId('user_missing')).resolves.toBe(false);

    const clerkUserId = `user_${randomUUID().replaceAll('-', '')}`;
    const user = await repo.upsertByClerkId(
      clerkUserId,
      `it-${randomUUID()}@example.com`,
    );
    cleanup.userIds.push(user.id);

    await expect(repo.deleteByClerkId(clerkUserId)).resolves.toBe(true);
    await expect(repo.findByClerkId(clerkUserId)).resolves.toBeNull();
  });
});
