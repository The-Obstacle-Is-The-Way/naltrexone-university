import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { createAction } from '@/src/adapters/controllers/create-action';
import { ApplicationError } from '@/src/application/errors';
import { FakeLogger } from '@/src/application/test-helpers/fakes';

describe('createAction', () => {
  it('returns VALIDATION_ERROR when input fails schema', async () => {
    const getDeps = vi.fn(async () => ({ value: 'deps' }));
    const execute = vi.fn(async () => ({ ok: true }) as const);

    const action = createAction({
      schema: z.object({ id: z.string().uuid() }).strict(),
      getDeps,
      execute,
    });

    const result = await action({ id: 'not-a-uuid' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.fieldErrors).toEqual({
        id: expect.any(Array),
      });
    }

    expect(getDeps).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('returns ok(result) when execute succeeds', async () => {
    type Deps = { value: string };
    const deps: Deps = { value: 'deps' };

    const getDeps = vi.fn(
      async (passedDeps?: Deps): Promise<Deps> => passedDeps ?? deps,
    );

    const execute = vi.fn(async (input: { name: string }, d: Deps) => {
      return { message: `${input.name}:${d.value}` };
    });

    const action = createAction<{ name: string }, { message: string }, Deps>({
      schema: z.object({ name: z.string().min(1) }).strict(),
      getDeps,
      execute,
    });

    const result = await action({ name: 'hi' }, deps);

    expect(result).toEqual({
      ok: true,
      data: { message: 'hi:deps' },
    } satisfies ActionResult<{ message: string }>);

    expect(getDeps).toHaveBeenCalledWith(deps, undefined);
    expect(execute).toHaveBeenCalledWith({ name: 'hi' }, deps, {
      depsSource: 'injected',
    });
  });

  it('passes default_container depsSource when loading deps from the default resolver', async () => {
    const getDeps = vi.fn(async () => ({ value: 'container-deps' }));
    const execute = vi.fn(async () => ({ ok: true }) as const);

    const action = createAction({
      schema: z.object({}).strict(),
      getDeps,
      execute,
    });

    await action({});

    expect(getDeps).toHaveBeenCalledWith(undefined, undefined);
    expect(execute).toHaveBeenCalledWith(
      {},
      { value: 'container-deps' },
      { depsSource: 'default_container' },
    );
  });

  it('passes custom_container depsSource when using a loadContainer override', async () => {
    const getDeps = vi.fn(async () => ({ value: 'custom-container-deps' }));
    const execute = vi.fn(async () => ({ ok: true }) as const);
    const logger = new FakeLogger();

    const action = createAction({
      schema: z.object({}).strict(),
      getDeps,
      execute,
    });

    await action({}, undefined, {
      loadContainer: async () => ({}) as never,
      logger,
    });

    expect(getDeps).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ loadContainer: expect.any(Function), logger }),
    );
    expect(execute).toHaveBeenCalledWith(
      {},
      { value: 'custom-container-deps' },
      { depsSource: 'custom_container' },
    );
  });

  it('maps ApplicationError via handleError', async () => {
    const action = createAction({
      schema: z.object({}).strict(),
      getDeps: async () => ({}),
      execute: async () => {
        throw new ApplicationError('NOT_FOUND', 'Missing');
      },
    });

    await expect(action({})).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Missing' },
    });
  });

  it('maps unknown errors to INTERNAL_ERROR via handleError', async () => {
    const action = createAction({
      schema: z.object({}).strict(),
      getDeps: async () => ({}),
      execute: async () => {
        throw new Error('boom');
      },
    });

    await expect(action({})).resolves.toMatchObject({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal error' },
    });
  });

  it('uses options.logger when mapping unknown errors', async () => {
    const fakeLogger = new FakeLogger();
    const action = createAction({
      schema: z.object({}).strict(),
      getDeps: async () => ({}),
      execute: async () => {
        throw new Error('boom');
      },
    });

    await expect(
      action({}, undefined, { logger: fakeLogger }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal error' },
    });

    expect(fakeLogger.errorCalls).toHaveLength(1);
    expect(fakeLogger.errorCalls[0]?.msg).toBe('Unhandled error in controller');
  });
});
