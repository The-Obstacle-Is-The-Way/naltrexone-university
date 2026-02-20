import { describe, expect, it } from 'vitest';
import { mapWithConcurrencyLimit } from './concurrency';

function createDeferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushUntil(
  condition: () => boolean,
  input?: { maxTicks?: number },
): Promise<void> {
  const maxTicks = input?.maxTicks ?? 50;
  for (let i = 0; i < maxTicks; i += 1) {
    if (condition()) return;
    await Promise.resolve();
  }
  throw new Error('Timed out waiting for condition');
}

describe('mapWithConcurrencyLimit', () => {
  it('respects the provided concurrency limit', async () => {
    const deferredByItem = new Map<
      number,
      ReturnType<typeof createDeferred<void>>
    >();
    const started: number[] = [];

    const promise = mapWithConcurrencyLimit([1, 2, 3, 4], 2, async (item) => {
      started.push(item);
      const deferred = createDeferred<void>();
      deferredByItem.set(item, deferred);
      await deferred.promise;
      return item;
    });

    await flushUntil(() => started.length === 2);
    expect(started).toEqual([1, 2]);

    deferredByItem.get(1)?.resolve();
    await flushUntil(() => started.length === 3);
    expect(started).toEqual([1, 2, 3]);

    deferredByItem.get(2)?.resolve();
    await flushUntil(() => started.length === 4);
    expect(started).toEqual([1, 2, 3, 4]);

    deferredByItem.get(3)?.resolve();
    deferredByItem.get(4)?.resolve();

    await expect(promise).resolves.toEqual([1, 2, 3, 4]);
  });

  it('maps every item and preserves result ordering', async () => {
    const calls: number[] = [];

    const result = await mapWithConcurrencyLimit([1, 2, 3], 3, async (item) => {
      calls.push(item);
      return item * 2;
    });

    expect(calls).toHaveLength(3);
    expect(new Set(calls)).toEqual(new Set([1, 2, 3]));
    expect(result).toEqual([2, 4, 6]);
  });

  it('throws when limit is less than 1', async () => {
    await expect(
      mapWithConcurrencyLimit([1], 0, async (x) => x),
    ).rejects.toThrow('limit must be >= 1');
  });

  it('throws when limit is NaN', async () => {
    await expect(
      mapWithConcurrencyLimit([1], NaN, async (x) => x),
    ).rejects.toThrow('limit must be >= 1');
  });

  it('propagates mapper errors', async () => {
    await expect(
      mapWithConcurrencyLimit([1, 2, 3], 2, async (item) => {
        if (item === 2) {
          throw new Error('boom');
        }
        return item;
      }),
    ).rejects.toThrow('boom');
  });
});
