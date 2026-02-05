import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApplicationError } from '@/src/application/errors';
import { FakeLogger } from '@/src/application/test-helpers/fakes';

vi.mock('server-only', () => ({}));

describe('action-result', () => {
  it('ok(data) returns an ok ActionResult', async () => {
    const { ok } = await import('./action-result');
    expect(ok({ a: 1 })).toEqual({ ok: true, data: { a: 1 } });
  });

  it('err(code, message) returns an error ActionResult', async () => {
    const { err } = await import('./action-result');
    expect(err('NOT_FOUND', 'Missing')).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Missing' },
    });
  });

  it('err(code, message, fieldErrors) includes fieldErrors', async () => {
    const { err } = await import('./action-result');
    expect(
      err('VALIDATION_ERROR', 'Invalid input', { email: ['Invalid'] }),
    ).toEqual({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        fieldErrors: { email: ['Invalid'] },
      },
    });
  });

  it('handleError maps ApplicationError', async () => {
    const { handleError } = await import('./action-result');
    const error = new ApplicationError('CONFLICT', 'User conflict', {
      email: ['Already taken'],
    });

    expect(handleError(error)).toEqual({
      ok: false,
      error: {
        code: 'CONFLICT',
        message: 'User conflict',
        fieldErrors: { email: ['Already taken'] },
      },
    });
  });

  it('handleError maps ZodError to VALIDATION_ERROR with fieldErrors', async () => {
    const { handleError } = await import('./action-result');
    const schema = z.object({ email: z.string().email() }).strict();
    const parsed = schema.safeParse({ email: 'not-an-email' });
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error('Expected schema to reject');

    expect(handleError(parsed.error)).toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        fieldErrors: { email: expect.any(Array) },
      },
    });
  });

  it('handleError maps unknown errors to INTERNAL_ERROR, logs them, and does not leak details', async () => {
    const { handleError } = await import('./action-result');
    const fakeLogger = new FakeLogger();

    expect(handleError(new Error('boom'), { logger: fakeLogger })).toEqual({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal error' },
    });

    expect(fakeLogger.errorCalls).toHaveLength(1);
    expect(fakeLogger.errorCalls[0]?.context).toMatchObject({
      err: expect.any(Error),
    });
    expect(fakeLogger.errorCalls[0]?.msg).toBe('Unhandled error in controller');
  });

  it('handleError does not log Next.js dynamic server usage errors', async () => {
    const { handleError } = await import('./action-result');
    const fakeLogger = new FakeLogger();
    const error = Object.assign(new Error('Dynamic server usage'), {
      digest: 'DYNAMIC_SERVER_USAGE',
    });

    expect(handleError(error, { logger: fakeLogger })).toEqual({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal error' },
    });
    expect(fakeLogger.errorCalls).toHaveLength(0);
  });
});
