import type { StripeClient } from '@/src/adapters/shared/stripe-types';

type StripeWebhookEvent = ReturnType<
  StripeClient['webhooks']['constructEvent']
>;

/**
 * Verifies a webhook delivery against the configured endpoint's signing
 * secret and, while a major-release migration overlaps two live endpoints,
 * the next endpoint's (docs/architecture/integrations/stripe.md). Each
 * endpoint signs with its own secret, so a delivery verifies against one.
 * When neither verifies, the configured secret's reason is kept, because it
 * tells a stale delivery from a forgery.
 */
export function constructStripeWebhookEvent({
  webhooks,
  rawBody,
  signature,
  secret,
  nextSecret,
}: {
  webhooks: StripeClient['webhooks'];
  rawBody: string;
  signature: string;
  secret: string;
  nextSecret?: string | undefined;
}): StripeWebhookEvent {
  try {
    return webhooks.constructEvent(rawBody, signature, secret);
  } catch (error) {
    if (!nextSecret) throw error;
    try {
      return webhooks.constructEvent(rawBody, signature, nextSecret);
    } catch {
      // Secondary failure: the configured secret's error is the one reported.
      throw error;
    }
  }
}

export type WebhookSignatureFailureReason =
  | 'missing_secret'
  | 'unparseable_header'
  | 'timestamp_outside_tolerance'
  | 'no_matching_signature'
  | 'other';

// The SDK's fixed messages, matched by prefix; its free text never reaches
// the log, only the reason (BUG-325).
const SIGNATURE_FAILURE_PREFIXES: ReadonlyArray<
  readonly [string, WebhookSignatureFailureReason]
> = [
  ['No webhook secret value was provided', 'missing_secret'],
  ['Unable to extract timestamp and signatures', 'unparseable_header'],
  ['No signatures found with expected scheme', 'unparseable_header'],
  ['Timestamp outside the tolerance zone', 'timestamp_outside_tolerance'],
  [
    'No signatures found matching the expected signature',
    'no_matching_signature',
  ],
];

/**
 * A fixed reason for a failed verification, which tells a misconfigured
 * secret or a stale delivery from a forgery without logging the caller's
 * header or the SDK's text.
 */
export function webhookSignatureFailureReason(
  error: unknown,
): WebhookSignatureFailureReason {
  if (!(error instanceof Error)) return 'other';
  const match = SIGNATURE_FAILURE_PREFIXES.find(([prefix]) =>
    error.message.startsWith(prefix),
  );
  return match?.[1] ?? 'other';
}
