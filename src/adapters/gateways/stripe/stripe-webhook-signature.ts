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
