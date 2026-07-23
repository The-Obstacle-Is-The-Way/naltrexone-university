import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toIdempotencyPublicError } from './to-idempotency-public-error';

describe('toIdempotencyPublicError', () => {
  it('preserves root-level Zod validation messages under _root', () => {
    const parsed = z.object({}).strict().safeParse({ unexpected: true });
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error('Expected schema to reject');

    expect(toIdempotencyPublicError(parsed.error)).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Invalid input',
      fieldErrors: {
        _root: ['Unrecognized key: "unexpected"'],
      },
    });
  });
});
