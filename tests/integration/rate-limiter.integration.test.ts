import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { DrizzleRateLimiter } from '@/src/adapters/gateways/drizzle-rate-limiter';
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

describe('DrizzleRateLimiter', () => {
  it('increments within a window and rejects over the limit', async () => {
    const now = () => new Date('2026-02-01T00:00:01.500Z');
    const limiter = new DrizzleRateLimiter(db, now);
    const key = `it-rate:${randomUUID()}`;
    cleanup.rateLimitKeys.push(key);

    const input = { key, limit: 2, windowMs: 1000 };

    await expect(limiter.limit(input)).resolves.toMatchObject({
      success: true,
      remaining: 1,
      retryAfterSeconds: 1,
    });
    await expect(limiter.limit(input)).resolves.toMatchObject({
      success: true,
      remaining: 0,
      retryAfterSeconds: 1,
    });
    await expect(limiter.limit(input)).resolves.toMatchObject({
      success: false,
      remaining: 0,
      retryAfterSeconds: 1,
    });
  });
});
