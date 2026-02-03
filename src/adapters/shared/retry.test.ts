import { describe, expect, it, vi } from 'vitest';
import { isTransientExternalError, retry } from './retry';

function createError(
  message: string,
  extra: Record<string, unknown>,
): Error & Record<string, unknown> {
  return Object.assign(new Error(message), extra);
}

describe('retry', () => {
  it('retries transient errors and returns the successful result', async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(createError('reset', { code: 'ECONNRESET' }))
      .mockResolvedValueOnce('ok');

    const sleep = vi.fn(async () => undefined);
    const onRetry = vi.fn();

    await expect(
      retry(fn, {
        maxAttempts: 2,
        initialDelayMs: 10,
        factor: 2,
        shouldRetry: isTransientExternalError,
        sleep,
        onRetry,
      }),
    ).resolves.toBe('ok');

    expect(fn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(10);
    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 1,
        maxAttempts: 2,
        delayMs: 10,
      }),
    );
  });

  it('does not retry non-transient errors', async () => {
    const error = createError('bad request', { statusCode: 400 });
    const fn = vi.fn(async () => {
      throw error;
    });

    const sleep = vi.fn(async () => undefined);

    await expect(
      retry(fn, {
        maxAttempts: 3,
        initialDelayMs: 10,
        factor: 2,
        shouldRetry: isTransientExternalError,
        sleep,
      }),
    ).rejects.toBe(error);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('uses exponential backoff between attempts', async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(createError('timeout', { code: 'ETIMEDOUT' }))
      .mockRejectedValueOnce(createError('timeout', { code: 'ETIMEDOUT' }))
      .mockResolvedValueOnce('ok');

    const sleep = vi.fn(async () => undefined);

    await expect(
      retry(fn, {
        maxAttempts: 3,
        initialDelayMs: 10,
        factor: 2,
        shouldRetry: isTransientExternalError,
        sleep,
      }),
    ).resolves.toBe('ok');

    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 10);
    expect(sleep).toHaveBeenNthCalledWith(2, 20);
  });
});

describe('isTransientExternalError', () => {
  it('returns true for network errors', () => {
    expect(
      isTransientExternalError(createError('reset', { code: 'ECONNRESET' })),
    ).toBe(true);
  });

  it('returns true for 5xx errors', () => {
    expect(
      isTransientExternalError(createError('bad gateway', { statusCode: 502 })),
    ).toBe(true);
  });

  it('returns false for 4xx errors', () => {
    expect(
      isTransientExternalError(createError('not found', { statusCode: 404 })),
    ).toBe(false);
  });
});
