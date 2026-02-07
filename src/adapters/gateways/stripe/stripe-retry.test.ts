import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { callStripeWithRetry } from './stripe-retry';

describe('callStripeWithRetry', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries transient Stripe errors and logs each retry attempt', async () => {
    vi.useFakeTimers();
    const logger = new FakeLogger();

    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(
        Object.assign(new Error('upstream timeout'), { code: 'ETIMEDOUT' }),
      )
      .mockRejectedValueOnce(
        Object.assign(new Error('server unavailable'), { statusCode: 503 }),
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
      throw Object.assign(new Error('invalid request'), { statusCode: 400 });
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
});
