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

  it('returns the committed result when both storeResult and outcome logging fail', async () => {
    class StoreResultFailingRepo extends FakeIdempotencyKeyRepository {
      override async storeResult(): Promise<void> {
        throw new Error('store result failed');
      }
    }

    class ThrowingErrorLogger extends FakeLogger {
      override error(): void {
        throw new Error('logger failed');
      }
    }

    const now = () => new Date('2026-02-08T00:00:00.000Z');
    const repo = new StoreResultFailingRepo(now);
    const logger = new ThrowingErrorLogger();
    const execute = vi.fn(async () => ({ ok: true }));

    await expect(
      withIdempotency({
        repo,
        userId: appUserId,
        action: 'billing:createCheckoutSession',
        key: '14141414-1414-1414-1414-141414141414',
        now,
        logger,
        execute,
      }),
    ).resolves.toEqual({ ok: true });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('preserves the stale-claim error when storeResult detects a fenced claim', async () => {
    const staleClaimError = new ApplicationError(
      'NOT_FOUND',
      'Idempotency claim is no longer current',
    );
    class StaleClaimRepo extends FakeIdempotencyKeyRepository {
      override async storeResult(): Promise<void> {
        throw staleClaimError;
      }
    }

    const now = () => new Date('2026-02-08T00:00:00.000Z');
    const repo = new StaleClaimRepo(now);
    const logger = new FakeLogger();
    const execute = vi.fn(async () => ({ ok: true }));

    await expect(
      withIdempotency({
        repo,
        userId: appUserId,
        action: 'billing:createCheckoutSession',
        key: '15151515-1515-1515-1515-151515151515',
        now,
        logger,
        execute,
      }),
    ).rejects.toBe(staleClaimError);
    expect(logger.errorCalls).toHaveLength(0);
  });

  it('returns the committed result after a stale-claim outcome failure when the owner explicitly guarantees replay safety', async () => {
    const staleClaimError = new ApplicationError(
      'NOT_FOUND',
      'Idempotency claim is no longer current',
    );
    class StaleClaimRepo extends FakeIdempotencyKeyRepository {
      override async storeResult(): Promise<void> {
        throw staleClaimError;
      }
    }

    const now = () => new Date('2026-02-08T00:00:00.000Z');
    const repo = new StaleClaimRepo(now);
    const logger = new FakeLogger();
    const committedResult = { feedbackId: crypto.randomUUID() };
    const execute = vi.fn(async () => committedResult);

    await expect(
      withIdempotency({
        repo,
        userId: appUserId,
        action: 'question-feedback:submitQuestionReport',
        key: '15151515-1515-1515-1515-151515151516',
        now,
        logger,
        outcomeStoreFailurePolicy: 'return-result',
        execute,
      }),
    ).resolves.toEqual(committedResult);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(logger.errorCalls).toHaveLength(1);
  });

  it('logs non-error storeResult failures and returns the committed result', async () => {
    class StoreResultFailingRepo extends FakeIdempotencyKeyRepository {
      override async storeResult(): Promise<void> {
        return Promise.reject('store result failed literal');
      }
    }

    const now = () => new Date('2026-02-08T00:00:00.000Z');
    const repo = new StoreResultFailingRepo(now);
    const logger = new FakeLogger();
    const execute = vi.fn(async () => ({ ok: true }));
    const key = '16161616-1616-1616-1616-161616161616';

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
    expect(logger.errorCalls[0]).toMatchObject({
      context: {
        storeResultError: 'store result failed literal',
      },
    });
  });

  it('caches an indeterminate error instead of replaying non-replayable actions after storeResult fails', async () => {
    class StoreResultFailingRepo extends FakeIdempotencyKeyRepository {
      override async storeResult(): Promise<void> {
        throw new Error('store result failed');
      }
    }

    const now = () => new Date('2026-02-08T00:00:00.000Z');
    const repo = new StoreResultFailingRepo(now);
    const logger = new FakeLogger();
    const execute = vi.fn(async () => ({ feedbackId: crypto.randomUUID() }));
    const key = '17171717-1717-1717-1717-171717171717';
    const input = {
      repo,
      userId: appUserId,
      action: 'question-feedback:submitQuestionReport',
      key,
      now,
      logger,
      outcomeStoreFailurePolicy: 'cache-error-and-throw' as const,
      execute,
    };

    await expect(withIdempotency(input)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message:
        'Idempotency outcome could not be recorded after committed success',
    });
    await expect(withIdempotency(input)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message:
        'Idempotency outcome could not be recorded after committed success',
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('logs when it caches an indeterminate error after storeResult fails', async () => {
    class StoreResultFailingRepo extends FakeIdempotencyKeyRepository {
      override async storeResult(): Promise<void> {
        throw new Error('store result failed');
      }
    }

    const now = () => new Date('2026-02-08T00:00:00.000Z');
    const repo = new StoreResultFailingRepo(now);
    const logger = new FakeLogger();
    const execute = vi.fn(async () => ({ feedbackId: crypto.randomUUID() }));

    await expect(
      withIdempotency({
        repo,
        userId: appUserId,
        action: 'question-feedback:submitQuestionReport',
        key: '21212121-2121-2121-2121-212121212121',
        now,
        logger,
        outcomeStoreFailurePolicy: 'cache-error-and-throw',
        execute,
      }),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message:
        'Idempotency outcome could not be recorded after committed success',
    });

    expect(logger.errorCalls).toEqual([
      {
        msg: 'Idempotency outcome write failed after committed success; cached indeterminate error',
        context: {
          action: 'question-feedback:submitQuestionReport',
          key: '21212121-2121-2121-2121-212121212121',
          storeResultError: 'store result failed',
          userId: appUserId,
        },
      },
    ]);
  });

  it('throws the indeterminate error and logs when caching it also fails', async () => {
    class OutcomeWriteFailingRepo extends FakeIdempotencyKeyRepository {
      override async storeResult(): Promise<void> {
        throw new Error('store result failed');
      }

      override async storeError(): Promise<void> {
        throw new Error('store error failed');
      }
    }

    const now = () => new Date('2026-02-08T00:00:00.000Z');
    const repo = new OutcomeWriteFailingRepo(now);
    const logger = new FakeLogger();
    const execute = vi.fn(async () => ({ feedbackId: crypto.randomUUID() }));

    await expect(
      withIdempotency({
        repo,
        userId: appUserId,
        action: 'question-feedback:submitQuestionReport',
        key: '18181818-1818-1818-1818-181818181818',
        now,
        logger,
        outcomeStoreFailurePolicy: 'cache-error-and-throw',
        execute,
      }),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message:
        'Idempotency outcome could not be recorded after committed success',
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(logger.errorCalls).toHaveLength(1);
    expect(logger.errorCalls[0]).toMatchObject({
      msg: 'Failed to persist indeterminate idempotency outcome',
      context: {
        action: 'question-feedback:submitQuestionReport',
        key: '18181818-1818-1818-1818-181818181818',
        storeError: 'store error failed',
        storeResultError: 'store result failed',
        userId: appUserId,
      },
    });
  });

  it('logs non-error indeterminate outcome cache failures', async () => {
    class OutcomeWriteFailingRepo extends FakeIdempotencyKeyRepository {
      override async storeResult(): Promise<void> {
        return Promise.reject('store result failed literal');
      }

      override async storeError(): Promise<void> {
        return Promise.reject('store error failed literal');
      }
    }

    const now = () => new Date('2026-02-08T00:00:00.000Z');
    const repo = new OutcomeWriteFailingRepo(now);
    const logger = new FakeLogger();
    const execute = vi.fn(async () => ({ feedbackId: crypto.randomUUID() }));

    await expect(
      withIdempotency({
        repo,
        userId: appUserId,
        action: 'question-feedback:submitQuestionReport',
        key: '19191919-1919-1919-1919-191919191919',
        now,
        logger,
        outcomeStoreFailurePolicy: 'cache-error-and-throw',
        execute,
      }),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message:
        'Idempotency outcome could not be recorded after committed success',
    });

    expect(logger.errorCalls[0]).toMatchObject({
      context: {
        storeError: 'store error failed literal',
        storeResultError: 'store result failed literal',
      },
    });
  });

  it('preserves the indeterminate error when indeterminate outcome logging fails', async () => {
    class OutcomeWriteFailingRepo extends FakeIdempotencyKeyRepository {
      override async storeResult(): Promise<void> {
        throw new Error('store result failed');
      }

      override async storeError(): Promise<void> {
        throw new Error('store error failed');
      }
    }

    class ThrowingErrorLogger extends FakeLogger {
      override error(): void {
        throw new Error('logger failed');
      }
    }

    const now = () => new Date('2026-02-08T00:00:00.000Z');
    const repo = new OutcomeWriteFailingRepo(now);
    const logger = new ThrowingErrorLogger();
    const execute = vi.fn(async () => ({ feedbackId: crypto.randomUUID() }));

    await expect(
      withIdempotency({
        repo,
        userId: appUserId,
        action: 'question-feedback:submitQuestionReport',
        key: '20202020-2020-2020-2020-202020202020',
        now,
        logger,
        outcomeStoreFailurePolicy: 'cache-error-and-throw',
        execute,
      }),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message:
        'Idempotency outcome could not be recorded after committed success',
    });
  });
});
