import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import {
  FakeIdempotencyKeyRepository,
  FakeLogger,
} from '@/src/application/test-helpers/fakes';
import { withIdempotency } from './with-idempotency';

describe('withIdempotency abortClaim race safety', () => {
  it('does not abort a newer reclaimed row after a stale beforeExecute failure', async () => {
    const appUserId = crypto.randomUUID();
    const clock = { now: new Date('2026-02-07T00:00:00.000Z') };
    const now = () => clock.now;
    const repo = new FakeIdempotencyKeyRepository(now);
    const logger = new FakeLogger();
    const key = '11111111-1111-1111-1111-111111111116';
    const rateLimitError = new ApplicationError(
      'RATE_LIMITED',
      'Too many requests',
    );
    const beforeExecute = vi.fn(async () => {
      clock.now = new Date('2026-02-07T00:01:01.000Z');
      await repo.claim({
        userId: appUserId,
        action: 'billing:createCheckoutSession',
        key,
        expiresAt: new Date('2026-02-08T00:01:01.000Z'),
        zombieThresholdMs: 60_000,
      });
      throw rateLimitError;
    });
    const execute = vi.fn(async () => ({ ok: true }));

    await expect(
      withIdempotency({
        repo,
        userId: appUserId,
        action: 'billing:createCheckoutSession',
        key,
        now,
        logger,
        zombieThresholdMs: 60_000,
        beforeExecute,
        execute,
      }),
    ).rejects.toBe(rateLimitError);

    await expect(
      repo.find(appUserId, 'billing:createCheckoutSession', key),
    ).resolves.toEqual({
      resultJson: null,
      error: null,
      completedAt: null,
      expiresAt: new Date('2026-02-08T00:01:01.000Z'),
    });
    expect(execute).not.toHaveBeenCalled();
  });
});
