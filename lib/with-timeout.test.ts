import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimeoutError, withTimeout } from './with-timeout';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('TimeoutError', () => {
  it('has name "TimeoutError"', () => {
    const error = new TimeoutError(5000);
    expect(error.name).toBe('TimeoutError');
  });

  it('includes ms in message', () => {
    const error = new TimeoutError(3000);
    expect(error.message).toBe('Operation timed out after 3000ms');
  });

  it('exposes ms property', () => {
    const error = new TimeoutError(7500);
    expect(error.ms).toBe(7500);
  });

  it('is instanceof Error', () => {
    const error = new TimeoutError(1000);
    expect(error).toBeInstanceOf(Error);
  });
});

describe('withTimeout', () => {
  it('resolves when promise settles before timeout', async () => {
    const fast = Promise.resolve('done');
    const result = await withTimeout(fast, 1000);
    expect(result).toBe('done');
  });

  it('clears the timer after promise resolves (no timer leak)', async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    await withTimeout(Promise.resolve('done'), 1000);

    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
  });

  it('clears the timer after promise rejects (no timer leak)', async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    await expect(
      withTimeout(Promise.reject(new Error('boom')), 1000),
    ).rejects.toThrow('boom');

    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects with TimeoutError when promise exceeds timeout', async () => {
    const never = new Promise<string>(() => {});
    await expect(withTimeout(never, 50)).rejects.toThrow(TimeoutError);
  });

  it('includes timeout duration in TimeoutError', async () => {
    const never = new Promise<string>(() => {});
    await expect(withTimeout(never, 75)).rejects.toThrow(
      'Operation timed out after 75ms',
    );
  });

  it('preserves the resolved value', async () => {
    const data = { id: 1, name: 'test' };
    const promise = Promise.resolve(data);
    const result = await withTimeout(promise, 1000);
    expect(result).toEqual(data);
  });

  it('preserves the original error when promise rejects before timeout', async () => {
    const originalError = new Error('custom failure');
    const failing = Promise.reject(originalError);
    await expect(withTimeout(failing, 1000)).rejects.toThrow('custom failure');
  });

  it('does not reject with TimeoutError when promise rejects first', async () => {
    const failing = Promise.reject(new Error('fast fail'));
    await expect(withTimeout(failing, 1000)).rejects.toSatisfy(
      (error) => error instanceof Error && !(error instanceof TimeoutError),
    );
  });

  it('resolves with void for void promises', async () => {
    const voidPromise: Promise<void> = Promise.resolve();
    const result = await withTimeout(voidPromise, 1000);
    expect(result).toBeUndefined();
  });
});
