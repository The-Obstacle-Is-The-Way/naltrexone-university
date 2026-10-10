import { describe, expect, it } from 'vitest';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { CircuitBreaker } from './circuit-breaker';

describe('CircuitBreaker', () => {
  it('throws when failureThreshold is not a positive integer', () => {
    expect(
      () =>
        new CircuitBreaker({
          failureThreshold: 0,
          resetTimeoutMs: 60_000,
          openErrorCode: 'STRIPE_ERROR',
        }),
    ).toThrow('CircuitBreaker: failureThreshold must be a positive integer');
  });

  it('throws when resetTimeoutMs is negative', () => {
    expect(
      () =>
        new CircuitBreaker({
          failureThreshold: 1,
          resetTimeoutMs: -1,
          openErrorCode: 'STRIPE_ERROR',
        }),
    ).toThrow('CircuitBreaker: resetTimeoutMs must be a non-negative number');
  });

  it('uses the configured error code when the circuit is open', async () => {
    const breaker = new CircuitBreaker(
      {
        failureThreshold: 1,
        resetTimeoutMs: 60_000,
        openErrorCode: 'INTERNAL_ERROR',
      },
      () => 0,
    );

    await expect(
      breaker.execute(async () => {
        throw new Error('upstream failure');
      }),
    ).rejects.toThrow('upstream failure');

    await expect(breaker.execute(async () => 'ok')).rejects.toEqual(
      expect.objectContaining({
        code: 'INTERNAL_ERROR',
        message: 'Service temporarily unavailable',
      }),
    );
  });

  it('stays closed while failures remain below the threshold', async () => {
    let nowMs = 0;
    const breaker = new CircuitBreaker(
      {
        failureThreshold: 3,
        resetTimeoutMs: 60_000,
        openErrorCode: 'STRIPE_ERROR',
      },
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
      {
        failureThreshold: 2,
        resetTimeoutMs: 60_000,
        openErrorCode: 'STRIPE_ERROR',
      },
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
        message: 'Service temporarily unavailable',
      }),
    );
  });

  it('fast-fails while the circuit is open', async () => {
    const nowMs = 0;
    const breaker = new CircuitBreaker(
      {
        failureThreshold: 1,
        resetTimeoutMs: 60_000,
        openErrorCode: 'STRIPE_ERROR',
      },
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
        message: 'Service temporarily unavailable',
      }),
    );

    expect(calls).toBe(0);
  });

  it('transitions to half-open after the reset timeout and closes on a successful probe', async () => {
    let nowMs = 0;
    const breaker = new CircuitBreaker(
      {
        failureThreshold: 1,
        resetTimeoutMs: 60_000,
        openErrorCode: 'STRIPE_ERROR',
      },
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
      {
        failureThreshold: 1,
        resetTimeoutMs: 60_000,
        openErrorCode: 'STRIPE_ERROR',
      },
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
        message: 'Service temporarily unavailable',
      }),
    );

    expect(calls).toBe(0);
  });

  it('allows only one half-open probe while the probe is in flight', async () => {
    let nowMs = 0;
    const breaker = new CircuitBreaker(
      {
        failureThreshold: 1,
        resetTimeoutMs: 60_000,
        openErrorCode: 'STRIPE_ERROR',
      },
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
        message: 'Service temporarily unavailable',
      }),
    );

    expect(calls).toBe(0);

    deferred.resolve('probe ok');

    await expect(probePromise).resolves.toBe('probe ok');
  });

  // DEBT-501 item 6: an error the rule does not count is the service
  // answering, so it also ends a run of failures.
  describe('with a rule for which errors count', () => {
    const isOutage = (error: unknown) =>
      error instanceof Error && error.message === 'down';

    function breakerWithRule(now: () => number) {
      return new CircuitBreaker(
        {
          failureThreshold: 2,
          resetTimeoutMs: 60_000,
          openErrorCode: 'STRIPE_ERROR',
          isFailure: isOutage,
        },
        now,
      );
    }

    const failWith = (breaker: CircuitBreaker, message: string) =>
      breaker.execute(async () => {
        throw new Error(message);
      });

    it('never opens on errors the rule does not count', async () => {
      const breaker = breakerWithRule(() => 0);

      for (let call = 0; call < 3; call += 1) {
        await expect(failWith(breaker, 'refused')).rejects.toThrow('refused');
      }

      await expect(breaker.execute(async () => 'ok')).resolves.toBe('ok');
    });

    it('restarts the count of failures after an error it does not count', async () => {
      const breaker = breakerWithRule(() => 0);

      await expect(failWith(breaker, 'down')).rejects.toThrow('down');
      await expect(failWith(breaker, 'refused')).rejects.toThrow('refused');
      await expect(failWith(breaker, 'down')).rejects.toThrow('down');

      await expect(breaker.execute(async () => 'ok')).resolves.toBe('ok');
    });

    it('opens on consecutive errors the rule counts', async () => {
      const breaker = breakerWithRule(() => 0);

      await expect(failWith(breaker, 'down')).rejects.toThrow('down');
      await expect(failWith(breaker, 'down')).rejects.toThrow('down');

      await expect(breaker.execute(async () => 'ok')).rejects.toMatchObject({
        code: 'STRIPE_ERROR',
      });
    });

    it('closes when a half-open probe ends in an error it does not count', async () => {
      let nowMs = 0;
      const breaker = breakerWithRule(() => nowMs);
      await expect(failWith(breaker, 'down')).rejects.toThrow('down');
      await expect(failWith(breaker, 'down')).rejects.toThrow('down');
      nowMs = 60_000;

      await expect(failWith(breaker, 'refused')).rejects.toThrow('refused');

      await expect(failWith(breaker, 'down')).rejects.toThrow('down');
      await expect(breaker.execute(async () => 'ok')).resolves.toBe('ok');
    });
  });
});
