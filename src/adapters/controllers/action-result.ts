import { ZodError } from 'zod';
import { logger } from '@/lib/logger';
import type { ApplicationErrorCode } from '@/src/application/errors';
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
      };
    };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function err(
  code: ActionErrorCode,
  message: string,
  fieldErrors?: Record<string, string[]>,
): ActionResult<never> {
  return { ok: false, error: { code, message, fieldErrors } };
}

export function handleError(
  error: unknown,
  options?: { logger?: Logger },
): ActionResult<never> {
  const errorLogger = options?.logger ?? logger;

  if (isApplicationError(error)) {
    return err(error.code, error.message, error.fieldErrors);
  }

  if (error instanceof ZodError) {
    const flat = error.flatten().fieldErrors;
    const fieldErrors: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(flat)) {
      if (value) fieldErrors[key] = value;
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
