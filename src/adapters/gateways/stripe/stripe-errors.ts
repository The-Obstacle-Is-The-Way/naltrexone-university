import { isTransientExternalError } from '@/src/adapters/shared/retry';

function getStringProp(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  return typeof record[key] === 'string' ? record[key] : null;
}

// The SDK's error classes for Stripe failing rather than refusing. A
// connection error carries neither a code nor a status; an API error can
// carry no status (a 5xx whose body is not JSON, or a body cut off); a rate
// limit can arrive as a 400.
const STRIPE_OUTAGE_TYPES: ReadonlySet<string> = new Set([
  'StripeConnectionError',
  'StripeAPIError',
  'StripeRateLimitError',
]);

/**
 * A failure that means Stripe is unreachable or failing: a network error, a
 * 5xx or a 429, or one of the SDK's outage classes. A refusal of the request
 * itself is Stripe answering.
 */
export function isStripeOutage(error: unknown): boolean {
  const type = getStringProp(error, 'type');
  return (
    isTransientExternalError(error) ||
    (type !== null && STRIPE_OUTAGE_TYPES.has(type))
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
