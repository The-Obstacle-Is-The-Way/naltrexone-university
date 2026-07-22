import { ZodError } from 'zod';
import { logger } from '@/lib/logger';
import { projectSafeErrorDiagnostics } from '@/src/adapters/shared/safe-error-diagnostics';
import { toIdempotencyPublicError } from '@/src/adapters/shared/to-idempotency-public-error';
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

  if (
    !isApplicationError(error) &&
    !(error instanceof ZodError) &&
    !(
      typeof error === 'object' &&
      error !== null &&
      'digest' in error &&
      (error as { digest?: unknown }).digest === 'DYNAMIC_SERVER_USAGE'
    )
  ) {
    errorLogger.error(
      { err: projectSafeErrorDiagnostics(error) },
      'Unhandled error in controller',
    );
  }

  const publicError = toIdempotencyPublicError(error);
  return err(
    publicError.code,
    publicError.message,
    publicError.fieldErrors,
    publicError.details,
  );
}
