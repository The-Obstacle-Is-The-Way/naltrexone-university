import { describe, expect, it, vi } from 'vitest';
import {
  ApplicationError,
  PracticeSessionConflictReasons,
  practiceSessionAlreadyEndedError,
  practiceSessionStateChangedConcurrentlyError,
} from '@/src/application/errors';
import {
  FakeIdempotencyKeyRepository,
  FakeLogger,
} from '@/src/application/test-helpers/fakes';
import { withIdempotency } from './with-idempotency';

const appUserId = crypto.randomUUID();

const shouldCacheExceptTransientPracticeStateConflict = (
  error: unknown,
): boolean =>
  !(
    error instanceof ApplicationError &&
    error.details?.reason ===
      PracticeSessionConflictReasons.StateChangedConcurrently
  );

describe('withIdempotency practice-session conflict caching', () => {
  it('aborts transient practice-session state conflicts instead of caching them', async () => {
    const now = () => new Date('2026-02-07T00:00:00.000Z');
    const repo = new FakeIdempotencyKeyRepository(now);
    const logger = new FakeLogger();
    const key = '33333333-3333-3333-3333-333333334444';
    const transientConflict = practiceSessionStateChangedConcurrentlyError();
    const execute = vi
      .fn<() => Promise<{ ok: true }>>()
      .mockRejectedValueOnce(transientConflict)
      .mockResolvedValueOnce({ ok: true });

    const input = {
      repo,
      userId: appUserId,
      action: 'practice:setPracticeSessionQuestionMark',
      key,
      now,
      logger,
      shouldCacheError: shouldCacheExceptTransientPracticeStateConflict,
      execute,
    } as const;

    await expect(withIdempotency(input)).rejects.toBe(transientConflict);
    await expect(
      repo.find(appUserId, 'practice:setPracticeSessionQuestionMark', key),
    ).resolves.toBeNull();

    await expect(withIdempotency(input)).resolves.toEqual({ ok: true });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('logs abort failures without masking non-cacheable execute errors', async () => {
    class AbortFailingRepo extends FakeIdempotencyKeyRepository {
      override async abortClaim(): Promise<void> {
        throw 'plain abort failure';
      }
    }

    const now = () => new Date('2026-02-07T00:00:00.000Z');
    const repo = new AbortFailingRepo(now);
    const logger = new FakeLogger();
    const key = '33333333-3333-3333-3333-333333337777';
    const originalError = 'plain execute failure';

    await expect(
      withIdempotency({
        repo,
        userId: appUserId,
        action: 'practice:setPracticeSessionQuestionMark',
        key,
        now,
        logger,
        shouldCacheError: () => false,
        execute: async () => {
          throw originalError;
        },
      }),
    ).rejects.toBe(originalError);

    expect(logger.errorCalls).toHaveLength(1);
    expect(logger.errorCalls[0]).toMatchObject({
      msg: 'Failed to abort idempotency claim after non-cacheable execute error',
      context: {
        userId: appUserId,
        action: 'practice:setPracticeSessionQuestionMark',
        key,
        abortError: 'plain abort failure',
        originalError: 'plain execute failure',
      },
    });
  });

  it('caches and rethrows the original execute error when the cache policy throws', async () => {
    const now = () => new Date('2026-02-07T00:00:00.000Z');
    const repo = new FakeIdempotencyKeyRepository(now);
    const logger = new FakeLogger();
    const key = '33333333-3333-3333-3333-333333338888';
    const originalError = practiceSessionStateChangedConcurrentlyError();
    const policyError = new Error('policy failed');
    const execute = vi.fn(async () => {
      throw originalError;
    });

    const input = {
      repo,
      userId: appUserId,
      action: 'practice:setPracticeSessionQuestionMark',
      key,
      now,
      logger,
      shouldCacheError: () => {
        throw policyError;
      },
      execute,
    } as const;

    await expect(withIdempotency(input)).rejects.toBe(originalError);
    await expect(withIdempotency(input)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Practice session state changed concurrently; please retry.',
      details: {
        reason: PracticeSessionConflictReasons.StateChangedConcurrently,
      },
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('replays cached terminal practice-session conflicts with details intact', async () => {
    const now = () => new Date('2026-02-07T00:00:00.000Z');
    const repo = new FakeIdempotencyKeyRepository(now);
    const logger = new FakeLogger();
    const key = '33333333-3333-3333-3333-333333335555';
    const terminalConflict = practiceSessionAlreadyEndedError();
    const execute = vi.fn(async () => {
      throw terminalConflict;
    });

    const input = {
      repo,
      userId: appUserId,
      action: 'practice:finalizeExamAnswers',
      key,
      now,
      logger,
      execute,
    } as const;

    await expect(withIdempotency(input)).rejects.toBe(terminalConflict);
    await expect(withIdempotency(input)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Practice session already ended',
      details: {
        reason: PracticeSessionConflictReasons.AlreadyEnded,
      },
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('replays legacy cached errors that have no details', async () => {
    const now = () => new Date('2026-02-07T00:00:00.000Z');
    const repo = new FakeIdempotencyKeyRepository(now);
    const logger = new FakeLogger();
    const key = '33333333-3333-3333-3333-333333336666';
    const claimedAt = await repo.claim({
      userId: appUserId,
      action: 'practice:finalizeExamAnswers',
      key,
      expiresAt: new Date('2026-02-08T00:00:00.000Z'),
    });
    if (!claimedAt) throw new Error('Expected cached-error claim');
    await repo.storeError({
      userId: appUserId,
      action: 'practice:finalizeExamAnswers',
      key,
      claimedAt,
      error: {
        code: 'CONFLICT',
        message: 'Practice session already ended',
      },
    });

    const execute = vi.fn(async () => ({ ok: true }));
    const caught = await withIdempotency({
      repo,
      userId: appUserId,
      action: 'practice:finalizeExamAnswers',
      key,
      now,
      logger,
      execute,
    }).catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(ApplicationError);
    expect(caught).toMatchObject({
      code: 'CONFLICT',
      message: 'Practice session already ended',
    });
    expect((caught as ApplicationError).details).toBeUndefined();
    expect(execute).not.toHaveBeenCalled();
  });
});
