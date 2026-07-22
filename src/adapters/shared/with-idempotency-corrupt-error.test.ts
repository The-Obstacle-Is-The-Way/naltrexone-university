import { describe, expect, it, vi } from 'vitest';
import {
  FakeIdempotencyKeyRepository,
  FakeLogger,
} from '@/src/application/test-helpers/fakes';
import { withIdempotency } from './with-idempotency';

const appUserId = crypto.randomUUID();

describe('withIdempotency corrupt cached errors', () => {
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
});
