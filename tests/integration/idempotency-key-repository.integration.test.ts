import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { DrizzleIdempotencyKeyRepository } from '@/src/adapters/repositories/drizzle-idempotency-key-repository';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createUser,
} from './helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

describe('DrizzleIdempotencyKeyRepository', () => {
  it('claims keys and stores results + errors', async () => {
    const user = await createUser(db, cleanup);
    const completedAt = new Date('2026-02-01T00:00:00.000Z');
    const now = () => completedAt;
    const repo = new DrizzleIdempotencyKeyRepository(db, now);

    const expiresAt = new Date('2026-02-02T00:00:00.000Z');

    await expect(
      repo.claim({ userId: user.id, action: 'it', key: 'k1', expiresAt }),
    ).resolves.toBe(true);

    await repo.storeResult({
      userId: user.id,
      action: 'it',
      key: 'k1',
      resultJson: { ok: true },
    });

    await expect(repo.find(user.id, 'it', 'k1')).resolves.toMatchObject({
      resultJson: { ok: true },
      error: null,
      completedAt,
      expiresAt,
    });

    await expect(
      repo.claim({ userId: user.id, action: 'it', key: 'k2', expiresAt }),
    ).resolves.toBe(true);

    await repo.storeError({
      userId: user.id,
      action: 'it',
      key: 'k2',
      error: { code: 'INTERNAL_ERROR', message: 'boom' },
    });

    await expect(repo.find(user.id, 'it', 'k2')).resolves.toMatchObject({
      resultJson: null,
      error: { code: 'INTERNAL_ERROR', message: 'boom' },
      completedAt,
      expiresAt,
    });
  });

  it('keeps completed null results distinguishable from pending rows', async () => {
    const user = await createUser(db, cleanup);
    const completedAt = new Date('2026-02-01T00:00:00.000Z');
    const now = () => completedAt;
    const repo = new DrizzleIdempotencyKeyRepository(db, now);
    const expiresAt = new Date('2026-02-02T00:00:00.000Z');

    await expect(
      repo.claim({ userId: user.id, action: 'it', key: 'k-null', expiresAt }),
    ).resolves.toBe(true);

    await repo.storeResult({
      userId: user.id,
      action: 'it',
      key: 'k-null',
      resultJson: null,
    });

    await expect(repo.find(user.id, 'it', 'k-null')).resolves.toMatchObject({
      resultJson: null,
      error: null,
      completedAt,
      expiresAt,
    });
  });

  it('reclaims expired keys and resets stored state', async () => {
    const user = await createUser(db, cleanup);
    const now = () => new Date('2026-02-01T00:00:10.000Z');
    const repo = new DrizzleIdempotencyKeyRepository(db, now);

    const expiredAt = new Date('2026-02-01T00:00:00.000Z');
    await expect(
      repo.claim({
        userId: user.id,
        action: 'it',
        key: 'k3',
        expiresAt: expiredAt,
      }),
    ).resolves.toBe(true);

    await repo.storeResult({
      userId: user.id,
      action: 'it',
      key: 'k3',
      resultJson: { ok: true },
    });

    const refreshedAt = new Date('2026-02-02T00:00:00.000Z');
    await expect(
      repo.claim({
        userId: user.id,
        action: 'it',
        key: 'k3',
        expiresAt: refreshedAt,
      }),
    ).resolves.toBe(true);

    await expect(repo.find(user.id, 'it', 'k3')).resolves.toMatchObject({
      resultJson: null,
      error: null,
      completedAt: null,
      expiresAt: refreshedAt,
    });
  });

  it('reclaims zombie keys after the claim threshold and resets pending state', async () => {
    const user = await createUser(db, cleanup);
    let currentTime = new Date('2026-02-01T00:00:00.000Z');
    const now = () => currentTime;
    const repo = new DrizzleIdempotencyKeyRepository(db, now);

    const firstExpiry = new Date('2026-02-02T00:00:00.000Z');
    await expect(
      repo.claim({
        userId: user.id,
        action: 'it',
        key: 'k-zombie',
        expiresAt: firstExpiry,
        zombieThresholdMs: 60_000,
      }),
    ).resolves.toBe(true);

    currentTime = new Date('2026-02-01T00:00:30.000Z');
    await expect(
      repo.claim({
        userId: user.id,
        action: 'it',
        key: 'k-zombie',
        expiresAt: new Date('2026-02-02T00:00:30.000Z'),
        zombieThresholdMs: 60_000,
      }),
    ).resolves.toBe(false);

    currentTime = new Date('2026-02-01T00:01:10.000Z');
    const refreshedExpiry = new Date('2026-02-02T00:01:10.000Z');
    await expect(
      repo.claim({
        userId: user.id,
        action: 'it',
        key: 'k-zombie',
        expiresAt: refreshedExpiry,
        zombieThresholdMs: 60_000,
      }),
    ).resolves.toBe(true);

    await expect(repo.find(user.id, 'it', 'k-zombie')).resolves.toMatchObject({
      resultJson: null,
      error: null,
      completedAt: null,
      expiresAt: refreshedExpiry,
    });
  });
});
