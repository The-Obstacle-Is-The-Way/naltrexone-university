import { isTransientExternalError } from '@/src/adapters/shared/retry';

function getStringProp(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  return typeof record[key] === 'string' ? record[key] : null;
}

/**
 * A failure that means Stripe is unreachable or failing: a network error, a
 * 5xx or a 429, or the SDK's `StripeConnectionError` (a lost connection or its
 * own timeout), which carries neither a code nor a status. A refusal of the
 * request itself is Stripe answering.
 */
export function isStripeOutage(error: unknown): boolean {
  return (
    isTransientExternalError(error) ||
    getStringProp(error, 'type') === 'StripeConnectionError'
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
