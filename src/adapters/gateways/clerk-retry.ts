import { isTransientExternalError } from '@/src/adapters/shared/retry';

// @clerk/backend catches a failed fetch (a dropped connection, or a body it
// cannot read) and rethrows a ClerkAPIResponseError with no status, whose one
// error is `unexpected_error`. isTransientExternalError sees neither a
// transient code nor a status in that, so Clerk reads check for it as well
// (BUG-313). Only reads use this: retrying them is safe.
const CLERK_TRANSPORT_FAILURE = 'unexpected_error';

function isClerkTransportFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if ('status' in error && typeof error.status === 'number') return false;
  if (!('errors' in error) || !Array.isArray(error.errors)) return false;
  return error.errors.some(
    (entry: unknown) =>
      typeof entry === 'object' &&
      entry !== null &&
      'code' in entry &&
      entry.code === CLERK_TRANSPORT_FAILURE,
  );
}

export function isTransientClerkError(error: unknown): boolean {
  return isTransientExternalError(error) || isClerkTransportFailure(error);
}
