import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import {
  FakeIdempotencyKeyRepository,
  FakeLogger,
} from '@/src/application/test-helpers/fakes';
import { withIdempotency } from './with-idempotency';

describe('withIdempotency abortClaim race safety', () => {
  it('stores non-Error failures as INTERNAL_ERROR records for replay', async () => {
    const appUserId = crypto.randomUUID();
    const now = () => new Date('2026-02-07T00:00:00.000Z');
    const repo = new FakeIdempotencyKeyRepository(now);
    const logger = new FakeLogger();
    const key = '11111111-1111-1111-1111-111111111118';
    const execute = vi.fn(async () => {
      throw 'plain failure';
    });
    const input = {
      repo,
      userId: appUserId,
      action: 'billing:createCheckoutSession',
      key,
      now,
      logger,
      execute,
    } as const;

    await expect(withIdempotency(input)).rejects.toBe('plain failure');
    await expect(withIdempotency(input)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Internal error',
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('logs abort failures without masking the original beforeExecute error', async () => {
    class AbortFailingRepo extends FakeIdempotencyKeyRepository {
      override async abortClaim(): Promise<void> {
        throw new Error('abort failed');
      }
    }

    const appUserId = crypto.randomUUID();
    const now = () => new Date('2026-02-07T00:00:00.000Z');
    const repo = new AbortFailingRepo(now);
    const logger = new FakeLogger();
    const key = '11111111-1111-1111-1111-111111111119';
    const rateLimitError = new ApplicationError(
      'RATE_LIMITED',
      'Too many requests',
    );

    await expect(
      withIdempotency({
        repo,
        userId: appUserId,
        action: 'billing:createCheckoutSession',
        key,
        now,
        logger,
        beforeExecute: async () => {
          throw rateLimitError;
        },
        execute: async () => ({ ok: true }),
      }),
    ).rejects.toBe(rateLimitError);

    expect(logger.errorCalls).toHaveLength(1);
    expect(logger.errorCalls[0]).toMatchObject({
      msg: 'Failed to abort idempotency claim after beforeExecute failure',
      context: {
        userId: appUserId,
        action: 'billing:createCheckoutSession',
        key,
        abortError: 'abort failed',
        originalError: 'Too many requests',
      },
    });
  });

  it('skips beforeExecute for cached error replays', async () => {
    const appUserId = crypto.randomUUID();
    const now = () => new Date('2026-02-07T00:00:00.000Z');
    const repo = new FakeIdempotencyKeyRepository(now);
    const logger = new FakeLogger();
    const key = '11111111-1111-1111-1111-111111111115';

    const claimedAt = await repo.claim({
      userId: appUserId,
      action: 'billing:createCheckoutSession',
      key,
      expiresAt: new Date('2026-02-08T00:00:00.000Z'),
    });
    if (!claimedAt) throw new Error('Expected cached error claim');
    await repo.storeError({
      userId: appUserId,
      action: 'billing:createCheckoutSession',
      key,
      claimedAt,
      error: { code: 'NOT_FOUND', message: 'Missing customer' },
    });

    const beforeExecute = vi.fn(async () => {
      throw new ApplicationError('RATE_LIMITED', 'Too many requests');
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
        beforeExecute,
        execute,
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Missing customer',
    });

    expect(beforeExecute).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

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

  it('does not let a stale execution store over a newer reclaimed result', async () => {
    const appUserId = crypto.randomUUID();
    const clock = { now: new Date('2026-02-07T00:00:00.000Z') };
    const now = () => clock.now;
    const repo = new FakeIdempotencyKeyRepository(now);
    const logger = new FakeLogger();
    const key = '11111111-1111-1111-1111-111111111117';
    let releaseStaleExecution: (() => void) | undefined;
    const staleExecutionReleased = new Promise<void>((resolve) => {
      releaseStaleExecution = resolve;
    });
    let markStaleExecutionStarted: (() => void) | undefined;
    const staleExecutionStarted = new Promise<void>((resolve) => {
      markStaleExecutionStarted = resolve;
    });

    const execute = vi.fn(async () => {
      if (execute.mock.calls.length === 1) {
        markStaleExecutionStarted?.();
        await staleExecutionReleased;
        return { source: 'stale' };
      }

      return { source: 'newer' };
    });
    const base = {
      repo,
      userId: appUserId,
      action: 'billing:createCheckoutSession',
      key,
      now,
      logger,
      zombieThresholdMs: 60_000,
      execute,
    } as const;

    const stale = withIdempotency(base);
    await staleExecutionStarted;

    clock.now = new Date('2026-02-07T00:01:01.000Z');
    await expect(withIdempotency(base)).resolves.toEqual({ source: 'newer' });

    if (!releaseStaleExecution) {
      throw new Error('Expected stale execution release hook');
    }
    releaseStaleExecution();
    await expect(stale).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await expect(withIdempotency(base)).resolves.toEqual({ source: 'newer' });
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
