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

    const resultClaimedAt = await repo.claim({
      userId: user.id,
      action: 'it',
      key: 'k1',
      expiresAt,
    });
    expect(resultClaimedAt).toEqual(completedAt);
    if (!resultClaimedAt) throw new Error('Expected result claim');

    await repo.storeResult({
      userId: user.id,
      action: 'it',
      key: 'k1',
      claimedAt: resultClaimedAt,
      resultJson: { ok: true },
    });

    await expect(repo.find(user.id, 'it', 'k1')).resolves.toMatchObject({
      resultJson: { ok: true },
      error: null,
      completedAt,
      expiresAt,
    });

    const errorClaimedAt = await repo.claim({
      userId: user.id,
      action: 'it',
      key: 'k2',
      expiresAt,
    });
    expect(errorClaimedAt).toEqual(completedAt);
    if (!errorClaimedAt) throw new Error('Expected error claim');

    await repo.storeError({
      userId: user.id,
      action: 'it',
      key: 'k2',
      claimedAt: errorClaimedAt,
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

    const claimedAt = await repo.claim({
      userId: user.id,
      action: 'it',
      key: 'k-null',
      expiresAt,
    });
    expect(claimedAt).toEqual(completedAt);
    if (!claimedAt) throw new Error('Expected null-result claim');

    await repo.storeResult({
      userId: user.id,
      action: 'it',
      key: 'k-null',
      claimedAt,
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
    const claimedAt = new Date('2026-02-01T00:00:10.000Z');
    const now = () => claimedAt;
    const repo = new DrizzleIdempotencyKeyRepository(db, now);

    const expiredAt = new Date('2026-02-01T00:00:00.000Z');
    await expect(
      repo.claim({
        userId: user.id,
        action: 'it',
        key: 'k3',
        expiresAt: expiredAt,
      }),
    ).resolves.toEqual(claimedAt);

    await repo.storeResult({
      userId: user.id,
      action: 'it',
      key: 'k3',
      claimedAt,
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
    ).resolves.toEqual(claimedAt);

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
    ).resolves.toEqual(currentTime);

    currentTime = new Date('2026-02-01T00:00:30.000Z');
    await expect(
      repo.claim({
        userId: user.id,
        action: 'it',
        key: 'k-zombie',
        expiresAt: new Date('2026-02-02T00:00:30.000Z'),
        zombieThresholdMs: 60_000,
      }),
    ).resolves.toBeNull();

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
    ).resolves.toEqual(currentTime);

    await expect(repo.find(user.id, 'it', 'k-zombie')).resolves.toMatchObject({
      resultJson: null,
      error: null,
      completedAt: null,
      expiresAt: refreshedExpiry,
    });
  });

  it('does not abort a pending row reclaimed after the original claim token', async () => {
    const user = await createUser(db, cleanup);
    let currentTime = new Date('2026-02-01T00:00:00.000Z');
    const now = () => currentTime;
    const repo = new DrizzleIdempotencyKeyRepository(db, now);
    const key = 'k-stale-abort';

    const firstClaimedAt = currentTime;
    await expect(
      repo.claim({
        userId: user.id,
        action: 'it',
        key,
        expiresAt: new Date('2026-02-02T00:00:00.000Z'),
        zombieThresholdMs: 60_000,
      }),
    ).resolves.toEqual(firstClaimedAt);

    currentTime = new Date('2026-02-01T00:01:01.000Z');
    const reclaimedAt = currentTime;
    const reclaimedExpiry = new Date('2026-02-02T00:01:01.000Z');
    await expect(
      repo.claim({
        userId: user.id,
        action: 'it',
        key,
        expiresAt: reclaimedExpiry,
        zombieThresholdMs: 60_000,
      }),
    ).resolves.toEqual(reclaimedAt);

    await repo.abortClaim(user.id, 'it', key, firstClaimedAt);

    await expect(repo.find(user.id, 'it', key)).resolves.toMatchObject({
      resultJson: null,
      error: null,
      completedAt: null,
      expiresAt: reclaimedExpiry,
    });
  });

  it('does not let a stale result writer overwrite a newer reclaimed result', async () => {
    const user = await createUser(db, cleanup);
    let currentTime = new Date('2026-02-01T00:00:00.000Z');
    const now = () => currentTime;
    const repo = new DrizzleIdempotencyKeyRepository(db, now);
    const key = 'k-stale-result-store';

    const firstClaimedAt = currentTime;
    await expect(
      repo.claim({
        userId: user.id,
        action: 'it',
        key,
        expiresAt: new Date('2026-02-02T00:00:00.000Z'),
        zombieThresholdMs: 60_000,
      }),
    ).resolves.toEqual(firstClaimedAt);

    currentTime = new Date('2026-02-01T00:01:01.000Z');
    const reclaimedAt = currentTime;
    await expect(
      repo.claim({
        userId: user.id,
        action: 'it',
        key,
        expiresAt: new Date('2026-02-02T00:01:01.000Z'),
        zombieThresholdMs: 60_000,
      }),
    ).resolves.toEqual(reclaimedAt);

    await repo.storeResult({
      userId: user.id,
      action: 'it',
      key,
      claimedAt: reclaimedAt,
      resultJson: { source: 'newer' },
    });

    await expect(
      repo.storeResult({
        userId: user.id,
        action: 'it',
        key,
        claimedAt: firstClaimedAt,
        resultJson: { source: 'stale' },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await expect(repo.find(user.id, 'it', key)).resolves.toMatchObject({
      resultJson: { source: 'newer' },
      error: null,
    });
  });

  it('does not let a stale error writer overwrite a newer reclaimed result', async () => {
    const user = await createUser(db, cleanup);
    let currentTime = new Date('2026-02-01T00:00:00.000Z');
    const now = () => currentTime;
    const repo = new DrizzleIdempotencyKeyRepository(db, now);
    const key = 'k-stale-error-store';

    const firstClaimedAt = currentTime;
    await expect(
      repo.claim({
        userId: user.id,
        action: 'it',
        key,
        expiresAt: new Date('2026-02-02T00:00:00.000Z'),
        zombieThresholdMs: 60_000,
      }),
    ).resolves.toEqual(firstClaimedAt);

    currentTime = new Date('2026-02-01T00:01:01.000Z');
    const reclaimedAt = currentTime;
    await expect(
      repo.claim({
        userId: user.id,
        action: 'it',
        key,
        expiresAt: new Date('2026-02-02T00:01:01.000Z'),
        zombieThresholdMs: 60_000,
      }),
    ).resolves.toEqual(reclaimedAt);

    await repo.storeResult({
      userId: user.id,
      action: 'it',
      key,
      claimedAt: reclaimedAt,
      resultJson: { source: 'newer' },
    });

    await expect(
      repo.storeError({
        userId: user.id,
        action: 'it',
        key,
        claimedAt: firstClaimedAt,
        error: { code: 'INTERNAL_ERROR', message: 'stale' },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await expect(repo.find(user.id, 'it', key)).resolves.toMatchObject({
      resultJson: { source: 'newer' },
      error: null,
    });
  });

  it('rejects duplicate result completion with the same claim token', async () => {
    const user = await createUser(db, cleanup);
    let currentTime = new Date('2026-02-01T00:00:00.000Z');
    const now = () => currentTime;
    const repo = new DrizzleIdempotencyKeyRepository(db, now);
    const expiresAt = new Date('2026-02-02T00:00:00.000Z');
    const key = 'k-duplicate-result';

    const claimedAt = await repo.claim({
      userId: user.id,
      action: 'it',
      key,
      expiresAt,
    });
    if (!claimedAt) throw new Error('Expected result claim');

    currentTime = new Date('2026-02-01T00:00:05.000Z');
    await repo.storeResult({
      userId: user.id,
      action: 'it',
      key,
      claimedAt,
      resultJson: { source: 'first' },
    });

    currentTime = new Date('2026-02-01T00:00:06.000Z');
    await expect(
      repo.storeResult({
        userId: user.id,
        action: 'it',
        key,
        claimedAt,
        resultJson: { source: 'second' },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await expect(repo.find(user.id, 'it', key)).resolves.toMatchObject({
      resultJson: { source: 'first' },
      error: null,
      completedAt: new Date('2026-02-01T00:00:05.000Z'),
    });
  });

  it('rejects duplicate error completion with the same claim token', async () => {
    const user = await createUser(db, cleanup);
    let currentTime = new Date('2026-02-01T00:00:00.000Z');
    const now = () => currentTime;
    const repo = new DrizzleIdempotencyKeyRepository(db, now);
    const expiresAt = new Date('2026-02-02T00:00:00.000Z');
    const key = 'k-duplicate-error';

    const claimedAt = await repo.claim({
      userId: user.id,
      action: 'it',
      key,
      expiresAt,
    });
    if (!claimedAt) throw new Error('Expected error claim');

    currentTime = new Date('2026-02-01T00:00:05.000Z');
    await repo.storeError({
      userId: user.id,
      action: 'it',
      key,
      claimedAt,
      error: { code: 'INTERNAL_ERROR', message: 'first' },
    });

    currentTime = new Date('2026-02-01T00:00:06.000Z');
    await expect(
      repo.storeError({
        userId: user.id,
        action: 'it',
        key,
        claimedAt,
        error: { code: 'VALIDATION_ERROR', message: 'second' },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await expect(repo.find(user.id, 'it', key)).resolves.toMatchObject({
      resultJson: null,
      error: { code: 'INTERNAL_ERROR', message: 'first' },
      completedAt: new Date('2026-02-01T00:00:05.000Z'),
    });
  });

  it('aborts only pending incomplete claims and preserves completed rows', async () => {
    const user = await createUser(db, cleanup);
    const completedAt = new Date('2026-02-01T00:00:05.000Z');
    const now = () => completedAt;
    const repo = new DrizzleIdempotencyKeyRepository(db, now);
    const expiresAt = new Date('2026-02-02T00:00:00.000Z');

    const pendingClaimedAt = await repo.claim({
      userId: user.id,
      action: 'it',
      key: 'k-pending',
      expiresAt,
    });
    if (!pendingClaimedAt) throw new Error('Expected pending claim');
    const completedClaimedAt = await repo.claim({
      userId: user.id,
      action: 'it',
      key: 'k-completed',
      expiresAt,
    });
    if (!completedClaimedAt) throw new Error('Expected completed claim');
    await repo.storeResult({
      userId: user.id,
      action: 'it',
      key: 'k-completed',
      claimedAt: completedClaimedAt,
      resultJson: { ok: true },
    });

    await repo.abortClaim(user.id, 'it', 'k-pending', pendingClaimedAt);
    await repo.abortClaim(user.id, 'it', 'k-completed', completedClaimedAt);

    await expect(repo.find(user.id, 'it', 'k-pending')).resolves.toBeNull();
    await expect(
      repo.find(user.id, 'it', 'k-completed'),
    ).resolves.toMatchObject({
      resultJson: { ok: true },
      error: null,
      completedAt,
      expiresAt,
    });
  });

  it('does not abort stored error rows', async () => {
    const user = await createUser(db, cleanup);
    const completedAt = new Date('2026-02-01T00:00:05.000Z');
    const now = () => completedAt;
    const repo = new DrizzleIdempotencyKeyRepository(db, now);
    const expiresAt = new Date('2026-02-02T00:00:00.000Z');

    const errorClaimedAt = await repo.claim({
      userId: user.id,
      action: 'it',
      key: 'k-error',
      expiresAt,
    });
    if (!errorClaimedAt) throw new Error('Expected error claim');
    await repo.storeError({
      userId: user.id,
      action: 'it',
      key: 'k-error',
      claimedAt: errorClaimedAt,
      error: { code: 'INTERNAL_ERROR', message: 'boom' },
    });

    await repo.abortClaim(user.id, 'it', 'k-error', errorClaimedAt);

    await expect(repo.find(user.id, 'it', 'k-error')).resolves.toMatchObject({
      resultJson: null,
      error: { code: 'INTERNAL_ERROR', message: 'boom' },
      completedAt,
      expiresAt,
    });
  });
});
