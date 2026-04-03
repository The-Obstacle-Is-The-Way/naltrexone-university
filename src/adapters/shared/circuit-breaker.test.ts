import { describe, expect, it } from 'vitest';
import { CircuitBreaker } from './circuit-breaker';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe('CircuitBreaker', () => {
  it('stays closed while failures remain below the threshold', async () => {
    let nowMs = 0;
    const breaker = new CircuitBreaker(
      { failureThreshold: 3, resetTimeoutMs: 60_000 },
      () => nowMs,
    );

    const firstError = new Error('first failure');
    const secondError = new Error('second failure');
    const success = 'ok';

    await expect(
      breaker.execute(async () => {
        throw firstError;
      }),
    ).rejects.toBe(firstError);

    nowMs += 1;

    await expect(
      breaker.execute(async () => {
        throw secondError;
      }),
    ).rejects.toBe(secondError);

    const fn = async () => success;

    await expect(breaker.execute(fn)).resolves.toBe(success);
  });

  it('opens once failures reach the threshold', async () => {
    let nowMs = 0;
    const breaker = new CircuitBreaker(
      { failureThreshold: 2, resetTimeoutMs: 60_000 },
      () => nowMs,
    );

    const failure = new Error('upstream failure');
    const blockedFn = async () => 'should not run';

    await expect(
      breaker.execute(async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    nowMs += 1;

    await expect(
      breaker.execute(async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    await expect(breaker.execute(blockedFn)).rejects.toEqual(
      expect.objectContaining({
        code: 'STRIPE_ERROR',
        message: 'Stripe temporarily unavailable',
      }),
    );
  });

  it('fast-fails while the circuit is open', async () => {
    const nowMs = 0;
    const breaker = new CircuitBreaker(
      { failureThreshold: 1, resetTimeoutMs: 60_000 },
      () => nowMs,
    );

    await expect(
      breaker.execute(async () => {
        throw new Error('upstream failure');
      }),
    ).rejects.toThrow('upstream failure');

    let calls = 0;

    await expect(
      breaker.execute(async () => {
        calls += 1;
        return 'ok';
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'STRIPE_ERROR',
        message: 'Stripe temporarily unavailable',
      }),
    );

    expect(calls).toBe(0);
  });

  it('transitions to half-open after the reset timeout and closes on a successful probe', async () => {
    let nowMs = 0;
    const breaker = new CircuitBreaker(
      { failureThreshold: 1, resetTimeoutMs: 60_000 },
      () => nowMs,
    );

    await expect(
      breaker.execute(async () => {
        throw new Error('upstream failure');
      }),
    ).rejects.toThrow('upstream failure');

    nowMs = 60_000;

    await expect(breaker.execute(async () => 'probe ok')).resolves.toBe(
      'probe ok',
    );

    await expect(breaker.execute(async () => 'closed again')).resolves.toBe(
      'closed again',
    );
  });

  it('re-opens when the half-open probe fails', async () => {
    let nowMs = 0;
    const breaker = new CircuitBreaker(
      { failureThreshold: 1, resetTimeoutMs: 60_000 },
      () => nowMs,
    );

    await expect(
      breaker.execute(async () => {
        throw new Error('initial failure');
      }),
    ).rejects.toThrow('initial failure');

    nowMs = 60_000;

    await expect(
      breaker.execute(async () => {
        throw new Error('probe failure');
      }),
    ).rejects.toThrow('probe failure');

    let calls = 0;

    await expect(
      breaker.execute(async () => {
        calls += 1;
        return 'ok';
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'STRIPE_ERROR',
        message: 'Stripe temporarily unavailable',
      }),
    );

    expect(calls).toBe(0);
  });

  it('allows only one half-open probe while the probe is in flight', async () => {
    let nowMs = 0;
    const breaker = new CircuitBreaker(
      { failureThreshold: 1, resetTimeoutMs: 60_000 },
      () => nowMs,
    );

    await expect(
      breaker.execute(async () => {
        throw new Error('initial failure');
      }),
    ).rejects.toThrow('initial failure');

    nowMs = 60_000;

    const deferred = createDeferred<string>();
    const probePromise = breaker.execute(async () => deferred.promise);

    let calls = 0;

    await expect(
      breaker.execute(async () => {
        calls += 1;
        return 'second call';
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'STRIPE_ERROR',
        message: 'Stripe temporarily unavailable',
      }),
    );

    expect(calls).toBe(0);

    deferred.resolve('probe ok');

    await expect(probePromise).resolves.toBe('probe ok');
  });
});
