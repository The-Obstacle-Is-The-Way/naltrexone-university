import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { FakeIdempotencyKeyRepository } from '@/src/application/test-helpers/fakes';
import { withIdempotency } from './with-idempotency';

describe('withIdempotency', () => {
  it('executes once and returns cached result for subsequent calls', async () => {
    const now = () => new Date();
    const repo = new FakeIdempotencyKeyRepository(now);
    const execute = vi.fn(async () => ({ ok: true }));

    const input = {
      repo,
      userId: 'user_1',
      action: 'billing:createCheckoutSession',
      key: '11111111-1111-1111-1111-111111111111',
      now,
      execute,
    } as const;

    await expect(withIdempotency(input)).resolves.toEqual({ ok: true });
    await expect(withIdempotency(input)).resolves.toEqual({ ok: true });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('waits for an in-progress request and returns the stored result', async () => {
    const now = () => new Date();
    const repo = new FakeIdempotencyKeyRepository(now);

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
      userId: 'user_1',
      action: 'question:submitAnswer',
      key: '22222222-2222-2222-2222-222222222222',
      now,
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

  it('rethrows the stored ApplicationError for a repeated idempotency key', async () => {
    const now = () => new Date();
    const repo = new FakeIdempotencyKeyRepository(now);
    const key = '33333333-3333-3333-3333-333333333333';

    const execute = vi.fn(async () => {
      throw new ApplicationError('RATE_LIMITED', 'Too many requests');
    });

    const input = {
      repo,
      userId: 'user_1',
      action: 'practice:startPracticeSession',
      key,
      now,
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
});
