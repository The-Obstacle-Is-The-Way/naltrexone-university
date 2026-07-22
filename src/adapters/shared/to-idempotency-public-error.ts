import { ZodError, z } from 'zod';
import type { IdempotencyPublicError } from '@/src/application/errors';
import { isApplicationError } from '@/src/application/errors';

/**
 * Projects controller failures onto the one public shape used for first
 * responses and durable idempotency errors. Repository codecs remain the
 * validation boundary for persisted data.
 */
export function toIdempotencyPublicError(
  error: unknown,
): IdempotencyPublicError {
  if (isApplicationError(error)) {
    return {
      code: error.code,
      message:
        error.code === 'INTERNAL_ERROR' ? 'Internal error' : error.message,
      ...(error.fieldErrors !== undefined
        ? { fieldErrors: error.fieldErrors }
        : {}),
      ...(error.details !== undefined ? { details: error.details } : {}),
    };
  }

  if (error instanceof ZodError) {
    const flattened = z.flattenError(error).fieldErrors;
    const fieldErrors: Record<string, string[]> = {};
    for (const [field, messages] of Object.entries(flattened)) {
      if (Array.isArray(messages)) fieldErrors[field] = messages;
    }

    return {
      code: 'VALIDATION_ERROR',
      message: 'Invalid input',
      fieldErrors,
    };
  }

  return { code: 'INTERNAL_ERROR', message: 'Internal error' };
}
