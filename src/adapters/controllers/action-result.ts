import { ZodError } from 'zod';
import type { ApplicationErrorCode } from '@/src/application/errors';
import { isApplicationError } from '@/src/application/errors';

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

export function handleError(error: unknown): ActionResult<never> {
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

  return err('INTERNAL_ERROR', 'Internal error');
}
