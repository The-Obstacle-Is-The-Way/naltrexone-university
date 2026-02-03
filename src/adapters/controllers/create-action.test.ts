import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { createAction } from '@/src/adapters/controllers/create-action';
import { ApplicationError } from '@/src/application/errors';

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
    expect(execute).toHaveBeenCalledWith({ name: 'hi' }, deps);
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
});
