import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApplicationError } from '@/src/application/errors';
import { err, handleError, ok } from './action-result';

describe('action-result', () => {
  it('ok(data) returns an ok ActionResult', () => {
    expect(ok({ a: 1 })).toEqual({ ok: true, data: { a: 1 } });
  });

  it('err(code, message) returns an error ActionResult', () => {
    expect(err('NOT_FOUND', 'Missing')).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Missing' },
    });
  });

  it('err(code, message, fieldErrors) includes fieldErrors', () => {
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

  it('handleError maps ApplicationError', () => {
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

  it('handleError maps ZodError to VALIDATION_ERROR with fieldErrors', () => {
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

  it('handleError maps unknown errors to INTERNAL_ERROR without leaking details', () => {
    expect(handleError(new Error('boom'))).toEqual({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal error' },
    });
  });
});
