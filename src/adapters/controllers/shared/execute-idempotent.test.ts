import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  FakeIdempotencyKeyRepository,
  FakeLogger,
} from '@/src/application/test-helpers/fakes';
import { executeIdempotent } from './execute-idempotent';

class RecordingIdempotencyKeyRepository extends FakeIdempotencyKeyRepository {
  calls: string[] = [];

  override async claim(
    input: Parameters<FakeIdempotencyKeyRepository['claim']>[0],
  ): ReturnType<FakeIdempotencyKeyRepository['claim']> {
    this.calls.push('claim');
    return super.claim(input);
  }

  override async find(
    ...args: Parameters<FakeIdempotencyKeyRepository['find']>
  ): ReturnType<FakeIdempotencyKeyRepository['find']> {
    this.calls.push('find');
    return super.find(...args);
  }

  override async storeResult(
    input: Parameters<FakeIdempotencyKeyRepository['storeResult']>[0],
  ): ReturnType<FakeIdempotencyKeyRepository['storeResult']> {
    this.calls.push('storeResult');
    return super.storeResult(input);
  }

  override async storeError(
    input: Parameters<FakeIdempotencyKeyRepository['storeError']>[0],
  ): ReturnType<FakeIdempotencyKeyRepository['storeError']> {
    this.calls.push('storeError');
    return super.storeError(input);
  }

  override async pruneExpiredBefore(
    ...args: Parameters<FakeIdempotencyKeyRepository['pruneExpiredBefore']>
  ): ReturnType<FakeIdempotencyKeyRepository['pruneExpiredBefore']> {
    this.calls.push('pruneExpiredBefore');
    return super.pruneExpiredBefore(...args);
  }
}

function createDeps() {
  const now = () => new Date('2026-04-27T12:00:00.000Z');
  return {
    idempotencyKeyRepository: new RecordingIdempotencyKeyRepository(now),
    logger: new FakeLogger(),
    now,
  };
}

describe('executeIdempotent', () => {
  it('calls execute directly and never touches the repo when idempotencyKey is null', async () => {
    const deps = createDeps();
    const beforeExecute = vi.fn().mockResolvedValue(undefined);
    const execute = vi.fn().mockResolvedValue({ value: 1 });
    const schema = z.object({ value: z.number() });
    const userId = crypto.randomUUID();

    const result = await executeIdempotent({
      d: deps,
      userId,
      idempotencyKey: null,
      action: 'practice:test',
      outputSchema: schema,
      beforeExecute,
      execute,
    });

    expect(result).toEqual({ value: 1 });
    expect(beforeExecute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(deps.idempotencyKeyRepository.calls).toEqual([]);
  });

  it('does not run beforeExecute when a keyed request replays a cached result', async () => {
    const deps = createDeps();
    const beforeExecute = vi.fn().mockResolvedValue(undefined);
    const execute = vi.fn().mockResolvedValue({ value: 100 });
    const schema = z.object({ value: z.number() });
    const userId = crypto.randomUUID();
    const args = {
      d: deps,
      userId,
      idempotencyKey: '22222222-2222-2222-2222-222222222223',
      action: 'practice:test',
      outputSchema: schema,
      beforeExecute,
      execute,
    };

    const first = await executeIdempotent(args);
    const second = await executeIdempotent(args);

    expect(first).toEqual({ value: 100 });
    expect(second).toEqual({ value: 100 });
    expect(beforeExecute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('calls execute directly when idempotencyKey is undefined', async () => {
    const deps = createDeps();
    const execute = vi.fn().mockResolvedValue({ value: 2 });
    const schema = z.object({ value: z.number() });
    const userId = crypto.randomUUID();

    const result = await executeIdempotent({
      d: deps,
      userId,
      idempotencyKey: undefined,
      action: 'practice:test',
      outputSchema: schema,
      execute,
    });

    expect(result).toEqual({ value: 2 });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(deps.idempotencyKeyRepository.calls).toEqual([]);
  });

  it('preserves the no-key direct execution path without parsing output', async () => {
    const deps = createDeps();
    const execute = vi.fn().mockResolvedValue({ value: 'not-a-number' });
    const schema = z.object({ value: z.number() });
    const userId = crypto.randomUUID();

    await expect(
      executeIdempotent({
        d: deps,
        userId,
        idempotencyKey: null,
        action: 'practice:test',
        outputSchema: schema,
        execute,
      }),
    ).resolves.toEqual({ value: 'not-a-number' });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(deps.idempotencyKeyRepository.calls).toEqual([]);
  });

  it('delegates to withIdempotency when idempotencyKey is provided', async () => {
    const deps = createDeps();
    const execute = vi.fn().mockResolvedValue({ value: 42 });
    const schema = z.object({ value: z.number() });
    const userId = crypto.randomUUID();

    const result = await executeIdempotent({
      d: deps,
      userId,
      idempotencyKey: '11111111-1111-1111-1111-111111111111',
      action: 'practice:test',
      outputSchema: schema,
      execute,
    });

    expect(result).toEqual({ value: 42 });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(deps.idempotencyKeyRepository.calls).toEqual([
      'pruneExpiredBefore',
      'claim',
      'storeResult',
    ]);
  });

  it('returns the cached result on a duplicate idempotencyKey without re-running execute', async () => {
    const deps = createDeps();
    const execute = vi.fn().mockResolvedValue({ value: 100 });
    const schema = z.object({ value: z.number() });
    const userId = crypto.randomUUID();
    const args = {
      d: deps,
      userId,
      idempotencyKey: '22222222-2222-2222-2222-222222222222',
      action: 'practice:test',
      outputSchema: schema,
      execute,
    };

    const first = await executeIdempotent(args);
    const second = await executeIdempotent(args);

    expect(first).toEqual({ value: 100 });
    expect(second).toEqual({ value: 100 });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('parses cached results through the schema', async () => {
    const deps = createDeps();
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ value: 100 })
      .mockResolvedValueOnce({ value: 200 });
    const schema = z.object({ value: z.number() });
    const userId = crypto.randomUUID();
    const args = {
      d: deps,
      userId,
      idempotencyKey: '33333333-3333-3333-3333-333333333333',
      action: 'practice:test',
      outputSchema: schema,
      execute,
    };

    await executeIdempotent(args);
    await deps.idempotencyKeyRepository.storeResult({
      userId: args.userId,
      action: args.action,
      key: args.idempotencyKey,
      resultJson: { value: 'not-a-number' },
    });

    await expect(executeIdempotent(args)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Cached idempotency result is invalid',
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
