import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeLogger } from '@/src/application/test-helpers/fakes';

let callStripeWithRetry: typeof import('./stripe-retry').callStripeWithRetry;

function createStripeError(
  message: string,
  extra: Record<string, unknown>,
): Error & Record<string, unknown> {
  return Object.assign(new Error(message), extra);
}

describe('callStripeWithRetry', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-03T00:00:00.000Z'));
    vi.resetModules();
    ({ callStripeWithRetry } = await import('./stripe-retry'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retries transient Stripe errors and logs each retry attempt', async () => {
    const logger = new FakeLogger();

    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(
        createStripeError('upstream timeout', { code: 'ETIMEDOUT' }),
      )
      .mockRejectedValueOnce(
        createStripeError('server unavailable', { statusCode: 503 }),
      )
      .mockResolvedValueOnce('ok');

    const promise = callStripeWithRetry({
      operation: 'subscriptions.retrieve',
      fn,
      logger,
    });

    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(logger.warnCalls).toHaveLength(2);
    expect(logger.warnCalls[0]).toMatchObject({
      msg: 'Retrying Stripe API call',
      context: {
        operation: 'subscriptions.retrieve',
        attempt: 1,
        maxAttempts: 3,
        delayMs: 100,
      },
    });
    expect(logger.warnCalls[1]).toMatchObject({
      msg: 'Retrying Stripe API call',
      context: {
        operation: 'subscriptions.retrieve',
        attempt: 2,
        maxAttempts: 3,
        delayMs: 200,
      },
    });
  });

  it('does not retry non-transient errors', async () => {
    const logger = new FakeLogger();
    const fn = vi.fn(async () => {
      throw createStripeError('invalid request', { statusCode: 400 });
    });

    await expect(
      callStripeWithRetry({
        operation: 'checkout.sessions.create',
        fn,
        logger,
      }),
    ).rejects.toThrow('invalid request');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(logger.warnCalls).toHaveLength(0);
  });

  it('opens the circuit after five consecutive failed Stripe operations and fast-fails subsequent calls', async () => {
    const logger = new FakeLogger();
    const transientError = createStripeError('upstream timeout', {
      code: 'ETIMEDOUT',
    });
    const fn = vi.fn(async () => {
      throw transientError;
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const promise = callStripeWithRetry({
        operation: 'subscriptions.retrieve',
        fn,
        logger,
      });
      const rejection = expect(promise).rejects.toBe(transientError);
      await vi.runAllTimersAsync();
      await rejection;
    }

    expect(fn).toHaveBeenCalledTimes(15);

    const blockedFn = vi.fn(async () => 'ok');

    await expect(
      callStripeWithRetry({
        operation: 'subscriptions.retrieve',
        fn: blockedFn,
        logger,
      }),
    ).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
      message: 'Stripe temporarily unavailable',
    });

    expect(blockedFn).not.toHaveBeenCalled();
  });

  it('allows a half-open probe after the reset timeout and closes the circuit when the probe succeeds', async () => {
    const logger = new FakeLogger();
    const transientError = createStripeError('upstream timeout', {
      code: 'ETIMEDOUT',
    });
    const failingFn = vi.fn(async () => {
      throw transientError;
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const promise = callStripeWithRetry({
        operation: 'subscriptions.retrieve',
        fn: failingFn,
        logger,
      });
      const rejection = expect(promise).rejects.toBe(transientError);
      await vi.runAllTimersAsync();
      await rejection;
    }

    vi.advanceTimersByTime(60_000);

    const probeFn = vi.fn(async () => 'probe ok');
    await expect(
      callStripeWithRetry({
        operation: 'subscriptions.retrieve',
        fn: probeFn,
        logger,
      }),
    ).resolves.toBe('probe ok');

    const nextFn = vi.fn(async () => 'closed again');
    await expect(
      callStripeWithRetry({
        operation: 'subscriptions.retrieve',
        fn: nextFn,
        logger,
      }),
    ).resolves.toBe('closed again');

    expect(probeFn).toHaveBeenCalledTimes(1);
    expect(nextFn).toHaveBeenCalledTimes(1);
  });

  it('re-opens the circuit when the half-open probe fails', async () => {
    const logger = new FakeLogger();
    const transientError = createStripeError('upstream timeout', {
      code: 'ETIMEDOUT',
    });
    const failingFn = vi.fn(async () => {
      throw transientError;
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const promise = callStripeWithRetry({
        operation: 'subscriptions.retrieve',
        fn: failingFn,
        logger,
      });
      const rejection = expect(promise).rejects.toBe(transientError);
      await vi.runAllTimersAsync();
      await rejection;
    }

    vi.advanceTimersByTime(60_000);

    const probeFn = vi.fn(async () => {
      throw transientError;
    });

    const probePromise = callStripeWithRetry({
      operation: 'subscriptions.retrieve',
      fn: probeFn,
      logger,
    });
    const probeRejection = expect(probePromise).rejects.toBe(transientError);
    await vi.runAllTimersAsync();
    await probeRejection;

    const blockedFn = vi.fn(async () => 'ok');

    await expect(
      callStripeWithRetry({
        operation: 'subscriptions.retrieve',
        fn: blockedFn,
        logger,
      }),
    ).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
      message: 'Stripe temporarily unavailable',
    });

    expect(blockedFn).not.toHaveBeenCalled();
  });
});
