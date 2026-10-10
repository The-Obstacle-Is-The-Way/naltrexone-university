import { isTransientExternalError } from '@/src/adapters/shared/retry';

function getStringProp(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  return typeof record[key] === 'string' ? record[key] : null;
}

function getNumberProp(value: unknown, key: string): number | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  return typeof record[key] === 'number' ? record[key] : null;
}

/**
 * A failure that means Stripe is unreachable or failing: a network error, a
 * 5xx or a 429, or one of the SDK's outage classes whatever its status:
 * - `StripeConnectionError`, a lost connection or the SDK's own timeout, with
 *   neither a code nor a status;
 * - `StripeRateLimitError`, which can arrive as a 400.
 *
 * The SDK also raises `StripeAPIError` for any status it has no class for. It
 * counts only with no status: a 5xx whose body is not JSON, or a body cut
 * off. A 409 conflict with another request is Stripe answering, as is any
 * refusal of the request itself (#1440 review).
 */
export function isStripeOutage(error: unknown): boolean {
  if (isTransientExternalError(error)) return true;
  const type = getStringProp(error, 'type');
  if (type === 'StripeConnectionError' || type === 'StripeRateLimitError') {
    return true;
  }
  return (
    type === 'StripeAPIError' &&
    getNumberProp(error, 'statusCode') === null &&
    getNumberProp(error, 'status') === null
  );
}

export function isAlreadyCanceledError(error: unknown): boolean {
  const rawType = getStringProp(error, 'rawType');
  if (rawType !== 'invalid_request_error') {
    return false;
  }

  const code = getStringProp(error, 'code');
  if (code === 'resource_missing') {
    return true;
  }

  const message = getStringProp(error, 'message')?.toLowerCase();
  return (
    message?.includes('already canceled') === true ||
    message?.includes('no such subscription') === true
  );
}
