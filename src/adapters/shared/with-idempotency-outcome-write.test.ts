import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import {
  FakeIdempotencyKeyRepository,
  FakeLogger,
} from '@/src/application/test-helpers/fakes';
import { withIdempotency } from './with-idempotency';

const appUserId = crypto.randomUUID();

describe('withIdempotency outcome writes', () => {
  it('returns the committed result and does not cache an error when storeResult fails after execute succeeds', async () => {
    class StoreResultFailingRepo extends FakeIdempotencyKeyRepository {
      storeErrorCalls = 0;

      override async storeResult(): Promise<void> {
        throw new Error('store result failed');
      }

      override async storeError(
        input: Parameters<FakeIdempotencyKeyRepository['storeError']>[0],
      ): Promise<void> {
        this.storeErrorCalls += 1;
        await super.storeError(input);
      }
    }

    const now = () => new Date('2026-02-08T00:00:00.000Z');
    const repo = new StoreResultFailingRepo(now);
    const logger = new FakeLogger();
    const execute = vi.fn(async () => ({ ok: true }));
    const key = '12121212-1212-1212-1212-121212121212';

    await expect(
      withIdempotency({
        repo,
        userId: appUserId,
        action: 'billing:createCheckoutSession',
        key,
        now,
        logger,
        execute,
      }),
    ).resolves.toEqual({ ok: true });

    await expect(
      repo.find(appUserId, 'billing:createCheckoutSession', key),
    ).resolves.toMatchObject({
      error: null,
      completedAt: null,
    });
    expect(repo.storeErrorCalls).toBe(0);
    expect(logger.errorCalls).toHaveLength(1);
    expect(logger.errorCalls[0]).toMatchObject({
      msg: 'Idempotency outcome write failed after committed success',
      context: {
        userId: appUserId,
        action: 'billing:createCheckoutSession',
        key,
        storeResultError: 'store result failed',
      },
    });
  });

  it('continues to cache cacheable execute failures after separating outcome-write failures', async () => {
    const now = () => new Date('2026-02-08T00:00:00.000Z');
    const repo = new FakeIdempotencyKeyRepository(now);
    const logger = new FakeLogger();
    const key = '13131313-1313-1313-1313-131313131313';
    const executeError = new ApplicationError(
      'INTERNAL_ERROR',
      'execute failed',
    );
    const execute = vi.fn(async () => {
      throw executeError;
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

    await expect(withIdempotency(input)).rejects.toBe(executeError);
    await expect(withIdempotency(input)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'execute failed',
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
