import { TimeoutError } from '@/lib/with-timeout';
import type { ActionResult } from '@/src/adapters/controllers/action-result';

const FRIENDLY_TIMEOUT_MESSAGE = 'Request timed out. Please try again.';

export function getActionResultErrorMessage(
  result: ActionResult<unknown>,
): string {
  if (result.ok) return 'Unexpected ok result';
  return result.error.message;
}

export function getThrownErrorMessage(error: unknown): string {
  if (error instanceof TimeoutError) return FRIENDLY_TIMEOUT_MESSAGE;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.length > 0) return error;
  return 'Unexpected error';
}
