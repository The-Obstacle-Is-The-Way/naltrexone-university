import { ZodError, z } from 'zod';
import { logger } from '@/lib/logger';
import type {
  ApplicationErrorCode,
  ApplicationErrorDetails,
} from '@/src/application/errors';
import { isApplicationError } from '@/src/application/errors';
import type { Logger } from '@/src/application/ports/logger';

export type ActionErrorCode = ApplicationErrorCode;

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: ActionErrorCode;
        message: string;
        fieldErrors?: Record<string, string[]>;
        details?: ApplicationErrorDetails;
      };
    };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function err(
  code: ActionErrorCode,
  message: string,
  fieldErrors?: Record<string, string[]>,
  details?: ApplicationErrorDetails,
): ActionResult<never> {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(fieldErrors !== undefined ? { fieldErrors } : {}),
      ...(details !== undefined ? { details } : {}),
    },
  };
}

export function handleError(
  error: unknown,
  options?: { logger?: Logger },
): ActionResult<never> {
  const errorLogger = options?.logger ?? logger;

  if (isApplicationError(error)) {
    return err(error.code, error.message, error.fieldErrors, error.details);
  }

  if (error instanceof ZodError) {
    const flat = z.flattenError(error).fieldErrors;
    const fieldErrors: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(flat)) {
      if (Array.isArray(value)) fieldErrors[key] = value;
    }
    return err('VALIDATION_ERROR', 'Invalid input', fieldErrors);
  }

  if (
    !(
      typeof error === 'object' &&
      error !== null &&
      'digest' in error &&
      (error as { digest?: unknown }).digest === 'DYNAMIC_SERVER_USAGE'
    )
  ) {
    errorLogger.error({ err: error }, 'Unhandled error in controller');
  }
  return err('INTERNAL_ERROR', 'Internal error');
}
