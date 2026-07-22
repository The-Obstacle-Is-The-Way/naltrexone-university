import { describe, expect, it, vi } from 'vitest';
import {
  ApplicationConflictReasons,
  ApplicationError,
} from '@/src/application/errors';
import {
  FakeIdempotencyKeyRepository,
  FakeLogger,
} from '@/src/application/test-helpers/fakes';
import { withIdempotency } from './with-idempotency';

const appUserId = crypto.randomUUID();

describe('withIdempotency', () => {
  it('executes once and returns cached result for subsequent calls', async () => {
    const now = () => new Date();
    const repo = new FakeIdempotencyKeyRepository(now);
    const logger = new FakeLogger();
    const execute = vi.fn(async () => ({ ok: true }));

    const input = {
      repo,
      userId: appUserId,
      action: 'billing:createCheckoutSession',
      key: '11111111-1111-1111-1111-111111111111',
      now,
      logger,
      execute,
    } as const;

    await expect(withIdempotency(input)).resolves.toEqual({ ok: true });
    await expect(withIdempotency(input)).resolves.toEqual({ ok: true });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('runs beforeExecute only for the fresh claim and skips it for cached result replays', async () => {
    const now = () => new Date();
    const repo = new FakeIdempotencyKeyRepository(now);
    const logger = new FakeLogger();
    const beforeExecute = vi.fn(async () => undefined);
    const execute = vi.fn(async () => ({ ok: true }));

    const input = {
      repo,
      userId: appUserId,
      action: 'billing:createCheckoutSession',
      key: '11111111-1111-1111-1111-111111111113',
      now,
      logger,
      beforeExecute,
      execute,
    } as const;

    await expect(withIdempotency(input)).resolves.toEqual({ ok: true });
    await expect(withIdempotency(input)).resolves.toEqual({ ok: true });
    expect(beforeExecute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('aborts the fresh claim and does not cache errors thrown by beforeExecute', async () => {
    const now = () => new Date();
    const repo = new FakeIdempotencyKeyRepository(now);
    const logger = new FakeLogger();
    const key = '11111111-1111-1111-1111-111111111114';
    const rateLimitError = new ApplicationError(
      'RATE_LIMITED',
      'Too many requests',
    );
    const beforeExecute = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce(undefined);
    const execute = vi.fn(async () => ({ ok: true }));

    const input = {
      repo,
      userId: appUserId,
      action: 'billing:createCheckoutSession',
      key,
      now,
      logger,
      beforeExecute,
      execute,
    } as const;

    await expect(withIdempotency(input)).rejects.toBe(rateLimitError);
    await expect(
      repo.find(appUserId, 'billing:createCheckoutSession', key),
    ).resolves.toBeNull();

    await expect(withIdempotency(input)).resolves.toEqual({ ok: true });
    expect(beforeExecute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('parses cached results when parseResult is provided', async () => {
    const now = () => new Date();
    const repo = new FakeIdempotencyKeyRepository(now);
    const logger = new FakeLogger();
    const execute = vi.fn(async () => ({ ok: true }));
    const parseResult = vi.fn((value: unknown) => {
      if (typeof value !== 'object' || value === null) {
        throw new Error('invalid');
      }

      const record = value as { ok?: unknown };
      if (record.ok !== true) {
        throw new Error('invalid');
      }

      return { ok: true };
    });

    const input = {
      repo,
      userId: appUserId,
      action: 'billing:createCheckoutSession',
      key: '11111111-1111-1111-1111-111111111111',
      now,
      logger,
      parseResult,
      execute,
    } as const;

    await expect(withIdempotency(input)).resolves.toEqual({ ok: true });
    await expect(withIdempotency(input)).resolves.toEqual({ ok: true });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(parseResult).toHaveBeenCalledTimes(1);
  });

  it('does not replay cached payloads when completedAt is missing', async () => {
    class LegacyCompletedAtRepo extends FakeIdempotencyKeyRepository {
      override async find(userId: string, action: string, key: string) {
        const existing = await super.find(userId, action, key);
        if (!existing) return null;
        return { ...existing, completedAt: null };
      }
    }

    const now = () => new Date();
    const repo = new LegacyCompletedAtRepo(now);
    const logger = new FakeLogger();
    const execute = vi.fn(async () => ({ ok: true }));

    const input = {
      repo,
      userId: appUserId,
      action: 'billing:createCheckoutSession',
      key: '11111111-1111-1111-1111-111111111112',
      now,
      logger,
      pollIntervalMs: 1,
      maxWaitMs: 5,
      execute,
    } as const;

    await expect(withIdempotency(input)).resolves.toEqual({ ok: true });
    await expect(withIdempotency(input)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining(
        'Request timed out waiting for idempotency key',
      ),
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('waits for an in-progress request and returns the stored result', async () => {
    const now = () => new Date();
    const repo = new FakeIdempotencyKeyRepository(now);
    const logger = new FakeLogger();

    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });

    let resolve: ((value: { ok: true }) => void) | undefined;
    const execute = vi.fn(
      () =>
        new Promise<{ ok: true }>((r) => {
          markStarted?.();
          resolve = r;
        }),
    );

    const base = {
      repo,
      userId: appUserId,
      action: 'question:submitAnswer',
      key: '22222222-2222-2222-2222-222222222222',
      now,
      logger,
      pollIntervalMs: 1,
      maxWaitMs: 200,
      execute,
    } as const;

    const first = withIdempotency(base);
    await started;
    const second = withIdempotency(base);

    if (!resolve) throw new Error('Expected execute() to initialize resolve');
    resolve({ ok: true });

    await expect(first).resolves.toEqual({ ok: true });
    await expect(second).resolves.toEqual({ ok: true });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('replays cached null results without invoking execute', async () => {
    const now = () => new Date();
    const repo = new FakeIdempotencyKeyRepository(now);
    const logger = new FakeLogger();
    const key = '22222222-2222-2222-2222-222222222223';

    const claimedAt = await repo.claim({
      userId: appUserId,
      action: 'question:submitAnswer',
      key,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    if (!claimedAt) throw new Error('Expected cached null claim');

    await repo.storeResult({
      userId: appUserId,
      action: 'question:submitAnswer',
      key,
      claimedAt,
      resultJson: null,
    });

    const execute = vi.fn(async () => ({ ok: true }));
    await expect(
      withIdempotency({
        repo,
        userId: appUserId,
        action: 'question:submitAnswer',
        key,
        now,
        logger,
        execute,
      }),
    ).resolves.toBeNull();

    expect(execute).not.toHaveBeenCalled();
  });

  it('passes cached null results through parseResult when replaying', async () => {
    const now = () => new Date('2026-02-07T00:00:00.000Z');
    const repo = new FakeIdempotencyKeyRepository(now);
    const logger = new FakeLogger();
    const key = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    const claimedAt = await repo.claim({
      userId: appUserId,
      action: 'question:submitAnswer',
      key,
      expiresAt: new Date('2026-02-08T00:00:00.000Z'),
    });
    if (!claimedAt) throw new Error('Expected cached null claim');
    await repo.storeResult({
      userId: appUserId,
      action: 'question:submitAnswer',
      key,
      claimedAt,
      resultJson: null,
    });

    const parseResult = vi.fn(() => 'replayed');
    const execute = vi.fn(async () => 'executed');

    await expect(
      withIdempotency({
        repo,
        userId: appUserId,
        action: 'question:submitAnswer',
        key,
        now,
        logger,
        parseResult,
        execute,
      }),
    ).resolves.toBe('replayed');

    expect(parseResult).toHaveBeenCalledWith(null);
    expect(execute).not.toHaveBeenCalled();
  });

  it('throws INTERNAL_ERROR when parseResult rejects a cached null replay', async () => {
    const now = () => new Date('2026-02-07T00:00:00.000Z');
    const repo = new FakeIdempotencyKeyRepository(now);
    const logger = new FakeLogger();
    const key = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    const claimedAt = await repo.claim({
      userId: appUserId,
      action: 'question:submitAnswer',
      key,
      expiresAt: new Date('2026-02-08T00:00:00.000Z'),
    });
    if (!claimedAt) throw new Error('Expected cached null claim');
    await repo.storeResult({
      userId: appUserId,
      action: 'question:submitAnswer',
      key,
      claimedAt,
      resultJson: null,
    });

    const parseError = new Error('invalid');
    const parseResult = vi.fn(() => {
      throw parseError;
    });
    const execute = vi.fn(async () => ({ ok: true }));

    const promise = withIdempotency({
      repo,
      userId: appUserId,
      action: 'question:submitAnswer',
      key,
      now,
      logger,
      parseResult,
      execute,
    });

    await expect(promise).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Cached idempotency result is invalid',
    });
    const error = await promise.catch((caughtError: unknown) => caughtError);

    expect(error).toBeInstanceOf(ApplicationError);
    expect((error as Error).cause).toBe(parseError);
    expect(parseResult).toHaveBeenCalledWith(null);
    expect(execute).not.toHaveBeenCalled();
  });

  it('rethrows the stored ApplicationError for a repeated idempotency key', async () => {
    const now = () => new Date();
    const repo = new FakeIdempotencyKeyRepository(now);
    const logger = new FakeLogger();
    const key = '33333333-3333-3333-3333-333333333333';

    const execute = vi.fn(async () => {
      throw new ApplicationError('RATE_LIMITED', 'Too many requests');
    });

    const input = {
      repo,
      userId: appUserId,
      action: 'practice:startPracticeSession',
      key,
      now,
      logger,
      execute,
    } as const;

    await expect(withIdempotency(input)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      message: 'Too many requests',
    });

    await expect(withIdempotency(input)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      message: 'Too many requests',
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('returns a timeout message that acknowledges in-progress or crashed concurrent requests', async () => {
    let tick = 0;
    const now = () => {
      const baseMs = Date.parse('2026-02-07T00:00:00.000Z');
      const current = new Date(baseMs + tick * 10);
      tick += 1;
      return current;
    };

    const repo = new FakeIdempotencyKeyRepository(now);
    await repo.claim({
      userId: appUserId,
      action: 'billing:createCheckoutSession',
      key: '44444444-4444-4444-4444-444444444444',
      expiresAt: new Date('2026-02-08T00:00:00.000Z'),
    });

    const execute = vi.fn(async () => ({ ok: true }));
    const logger = new FakeLogger();

    await expect(
      withIdempotency({
        repo,
        userId: appUserId,
        action: 'billing:createCheckoutSession',
        key: '44444444-4444-4444-4444-444444444444',
        now,
        logger,
        maxWaitMs: 15,
        pollIntervalMs: 1,
        execute,
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      details: {
        reason: ApplicationConflictReasons.ConcurrentRequestInProgress,
      },
      message: expect.stringContaining(
        'Request timed out waiting for idempotency key',
      ),
    });

    expect(execute).not.toHaveBeenCalled();
  });

  it('reclaims zombie keys after the claim timeout threshold', async () => {
    let nowMs = Date.parse('2026-02-07T00:00:00.000Z');
    const now = () => {
      const current = new Date(nowMs);
      nowMs += 10;
      return current;
    };

    const repo = new FakeIdempotencyKeyRepository(now);
    const logger = new FakeLogger();
    const key = '44444444-4444-4444-4444-444444444446';

    await repo.claim({
      userId: appUserId,
      action: 'billing:createCheckoutSession',
      key,
      expiresAt: new Date('2026-02-08T00:00:00.000Z'),
      zombieThresholdMs: 60_000,
    });

    const execute = vi.fn(async () => ({ ok: true }));

    nowMs += 30_000;
    await expect(
      withIdempotency({
        repo,
        userId: appUserId,
        action: 'billing:createCheckoutSession',
        key,
        now,
        logger,
        maxWaitMs: 15,
        pollIntervalMs: 1,
        zombieThresholdMs: 60_000,
        execute,
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      details: {
        reason: ApplicationConflictReasons.ConcurrentRequestInProgress,
      },
    });
    expect(execute).not.toHaveBeenCalled();

    nowMs += 31_000;
    await expect(
      withIdempotency({
        repo,
        userId: appUserId,
        action: 'billing:createCheckoutSession',
        key,
        now,
        logger,
        zombieThresholdMs: 60_000,
        execute,
      }),
    ).resolves.toEqual({ ok: true });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('restarts when a concurrent waiter observes a beforeExecute-aborted claim', async () => {
    const now = () => new Date('2026-02-07T00:00:00.000Z');
    const repo = new FakeIdempotencyKeyRepository(now);
    const logger = new FakeLogger();
    const key = '44444444-4444-4444-4444-444444444445';
    const rateLimitError = new ApplicationError(
      'RATE_LIMITED',
      'Too many requests',
    );

    let markHookStarted: (() => void) | undefined;
    const hookStarted = new Promise<void>((resolve) => {
      markHookStarted = resolve;
    });

    let releaseHook: (() => void) | undefined;
    const release = new Promise<void>((resolve) => {
      releaseHook = resolve;
    });

    const beforeExecute = vi.fn(async () => {
      if (beforeExecute.mock.calls.length === 1) {
        markHookStarted?.();
        await release;
        throw rateLimitError;
      }
    });
    const execute = vi.fn(async () => ({ ok: true }));

    const input = {
      repo,
      userId: appUserId,
      action: 'billing:createCheckoutSession',
      key,
      now,
      logger,
      maxWaitMs: 100,
      pollIntervalMs: 1,
      beforeExecute,
      execute,
    } as const;

    const first = withIdempotency(input);
    await hookStarted;
    const second = withIdempotency(input);

    if (!releaseHook) {
      throw new Error('Expected beforeExecute to initialize release hook');
    }
    releaseHook();

    await expect(first).rejects.toBe(rateLimitError);
    await expect(second).resolves.toEqual({ ok: true });
    expect(beforeExecute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('prunes expired idempotency keys before processing requests', async () => {
    const nowDate = new Date('2026-02-07T12:00:00.000Z');
    const now = () => nowDate;
    const repo = new FakeIdempotencyKeyRepository(now);
    const logger = new FakeLogger();
    const pruneSpy = vi.spyOn(repo, 'pruneExpiredBefore');
    const execute = vi.fn(async () => ({ ok: true }));

    await expect(
      withIdempotency({
        repo,
        userId: appUserId,
        action: 'billing:createCheckoutSession',
        key: '55555555-5555-5555-5555-555555555555',
        now,
        logger,
        execute,
      }),
    ).resolves.toEqual({ ok: true });

    expect(pruneSpy).toHaveBeenCalledWith(nowDate, 100);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('does not fail when idempotency pruning fails', async () => {
    const nowDate = new Date('2026-02-07T12:00:00.000Z');
    const now = () => nowDate;
    const repo = new FakeIdempotencyKeyRepository(now);
    const logger = new FakeLogger();
    vi.spyOn(repo, 'pruneExpiredBefore').mockRejectedValue(
      new Error('prune failed'),
    );

    const execute = vi.fn(async () => ({ ok: true }));

    await expect(
      withIdempotency({
        repo,
        userId: appUserId,
        action: 'billing:createCheckoutSession',
        key: '66666666-6666-6666-6666-666666666666',
        now,
        logger,
        execute,
      }),
    ).resolves.toEqual({ ok: true });

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('logs a warning when idempotency pruning fails and continues', async () => {
    const nowDate = new Date('2026-02-07T12:00:00.000Z');
    const now = () => nowDate;
    const repo = new FakeIdempotencyKeyRepository(now);
    const logger = new FakeLogger();
    vi.spyOn(repo, 'pruneExpiredBefore').mockRejectedValue(
      new Error('prune failed'),
    );

    const execute = vi.fn(async () => ({ ok: true }));

    await expect(
      withIdempotency({
        repo,
        userId: appUserId,
        action: 'billing:createCheckoutSession',
        key: '77777777-7777-7777-7777-777777777777',
        now,
        logger,
        execute,
      }),
    ).resolves.toEqual({ ok: true });

    expect(logger.warnCalls).toHaveLength(1);
    expect(logger.warnCalls[0]).toMatchObject({
      msg: 'Idempotency prune failed',
      context: {
        userId: appUserId,
        action: 'billing:createCheckoutSession',
        key: '77777777-7777-7777-7777-777777777777',
        error: 'prune failed',
      },
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('throws INTERNAL_ERROR when cached idempotency result fails parseResult', async () => {
    const now = () => new Date();
    const repo = new FakeIdempotencyKeyRepository(now);
    const logger = new FakeLogger();

    await expect(
      withIdempotency({
        repo,
        userId: appUserId,
        action: 'billing:createCheckoutSession',
        key: '88888888-8888-8888-8888-888888888888',
        now,
        logger,
        execute: async () => ({ raw: true }),
      }),
    ).resolves.toEqual({ raw: true });

    const parseError = new Error('invalid cached result');
    const promise = withIdempotency({
      repo,
      userId: appUserId,
      action: 'billing:createCheckoutSession',
      key: '88888888-8888-8888-8888-888888888888',
      now,
      logger,
      execute: async () => ({ parsed: true }),
      parseResult: (value: unknown) => {
        if (
          typeof value !== 'object' ||
          value === null ||
          (value as { parsed?: boolean }).parsed !== true
        ) {
          throw parseError;
        }

        return { parsed: true };
      },
    });

    await expect(promise).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Cached idempotency result is invalid',
    });
    const error = await promise.catch((caughtError: unknown) => caughtError);

    expect(error).toBeInstanceOf(ApplicationError);
    expect((error as Error).cause).toBe(parseError);
  });

  it('stores non-ApplicationError failures as INTERNAL_ERROR for replay', async () => {
    const now = () => new Date();
    const repo = new FakeIdempotencyKeyRepository(now);
    const logger = new FakeLogger();
    const key = '99999999-9999-9999-9999-999999999999';
    const execute = vi.fn(async () => {
      throw new Error('unexpected failure');
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

    await expect(withIdempotency(input)).rejects.toThrow('unexpected failure');
    await expect(withIdempotency(input)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Internal error',
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('replays a legacy truncated diagnostic as Internal error without executing', async () => {
    const currentTime = new Date('2026-02-08T00:00:00.000Z');
    const now = () => currentTime;
    const repo = new FakeIdempotencyKeyRepository(now);
    const logger = new FakeLogger();
    const key = '99999999-9999-9999-9999-999999999998';
    const legacyDiagnostic = `${'d'.repeat(999)}…`;
    const execute = vi.fn(async () => ({ shouldNotRun: true }));
    repo.seedRawErrorRecord({
      userId: appUserId,
      action: 'question:submitAnswer',
      key,
      claimedAt: currentTime,
      completedAt: currentTime,
      expiresAt: new Date('2026-02-09T00:00:00.000Z'),
      error: { code: 'INTERNAL_ERROR', message: legacyDiagnostic },
    });

    await expect(
      withIdempotency({
        repo,
        userId: appUserId,
        action: 'question:submitAnswer',
        key,
        now,
        logger,
        execute,
      }),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Internal error',
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('fails loudly on a corrupt cached error, preserves the row, and never executes', async () => {
    const currentTime = new Date('2026-02-08T00:00:00.000Z');
    const now = () => currentTime;
    const repo = new FakeIdempotencyKeyRepository(now);
    const logger = new FakeLogger();
    const key = '99999999-9999-9999-9999-999999999997';
    const execute = vi.fn(async () => ({ shouldNotRun: true }));
    repo.seedRawErrorRecord({
      userId: appUserId,
      action: 'question:submitAnswer',
      key,
      claimedAt: currentTime,
      completedAt: currentTime,
      expiresAt: new Date('2026-02-09T00:00:00.000Z'),
      error: { code: 'NOT_FOUND', message: 'Missing', unknown: true },
    });

    const input = {
      repo,
      userId: appUserId,
      action: 'question:submitAnswer',
      key,
      now,
      logger,
      execute,
    } as const;

    await expect(withIdempotency(input)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      cause: expect.any(Error),
    });
    await expect(
      repo.find(appUserId, 'question:submitAnswer', key),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      cause: expect.any(Error),
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('rethrows the original execute error when storeError persistence fails', async () => {
    class StoreErrorFailingRepo extends FakeIdempotencyKeyRepository {
      override async storeError(): Promise<void> {
        throw new Error('store failed');
      }
    }

    const now = () => new Date('2026-02-08T00:00:00.000Z');
    const repo = new StoreErrorFailingRepo(now);
    const logger = new FakeLogger();
    const originalError = new ApplicationError(
      'INTERNAL_ERROR',
      'execute failed',
    );
    const execute = vi.fn(async () => {
      throw originalError;
    });

    await expect(
      withIdempotency({
        repo,
        userId: appUserId,
        action: 'billing:createCheckoutSession',
        key: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        now,
        logger,
        execute,
      }),
    ).rejects.toBe(originalError);

    expect(logger.errorCalls).toHaveLength(1);
    expect(logger.errorCalls[0]).toMatchObject({
      msg: 'Failed to persist idempotency error record',
      context: {
        userId: appUserId,
        action: 'billing:createCheckoutSession',
        key: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      },
    });
  });

  it('rethrows the original execute error when logger.error throws during storeError failure', async () => {
    class StoreErrorFailingRepo extends FakeIdempotencyKeyRepository {
      override async storeError(): Promise<void> {
        throw new Error('store failed');
      }
    }

    class ThrowingErrorLogger extends FakeLogger {
      override error(): void {
        throw new Error('logger failed');
      }
    }

    const now = () => new Date('2026-02-08T00:00:00.000Z');
    const repo = new StoreErrorFailingRepo(now);
    const logger = new ThrowingErrorLogger();
    const originalError = new ApplicationError(
      'INTERNAL_ERROR',
      'execute failed',
    );
    const execute = vi.fn(async () => {
      throw originalError;
    });

    await expect(
      withIdempotency({
        repo,
        userId: appUserId,
        action: 'billing:createCheckoutSession',
        key: 'ffffffff-1111-2222-3333-444444444444',
        now,
        logger,
        execute,
      }),
    ).rejects.toBe(originalError);
  });
});
