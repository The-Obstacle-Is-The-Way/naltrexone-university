import 'server-only';
import Stripe from 'stripe';
import { STRIPE_API_VERSION } from '@/lib/stripe-api-version';
import type { StripeCallBudget } from '@/src/adapters/gateways/stripe/stripe-call-budget';
import { StripeBudgetHttpClient } from './stripe-budget-http-client';

// DEBT-527: a backstop against a hung request, not a latency target. A try
// that Stripe is still processing when it is cut off fails even if Stripe
// completes it, and a retry with the same key meets a 409 while the first is
// in flight. So the limit sits well above Stripe's normal latency: a slow but
// working call still succeeds, and a hang still fails inside the 30-second
// request limit. Request-scoped clients also share a caller deadline.
export const STRIPE_REQUEST_LIMITS = {
  timeoutMs: 10_000,
  maxNetworkRetries: 1,
} as const;

export function createStripeClient(
  secretKey: string,
  connection: Pick<Stripe.StripeConfig, 'host' | 'port' | 'protocol'> = {},
  limits: {
    timeoutMs: number;
    maxNetworkRetries: number;
  } = STRIPE_REQUEST_LIMITS,
  budget?: StripeCallBudget,
): Stripe {
  return new Stripe(secretKey, {
    ...connection,
    /**
     * Pinned Stripe API version for outbound requests, to prevent silent
     * behavior changes across environments. It does not shape webhook
     * payloads: each Stripe webhook endpoint has its own version
     * (docs/architecture/integrations/stripe.md, "Webhook Endpoint API Versions").
     *
     * Update only after:
     * - Reviewing Stripe's API version changelog for breaking changes
     * - Verifying webhooks + checkout flows in a staging environment
     *
     * Reference: https://stripe.com/docs/upgrades#api-versions
     * Last reviewed: 2026-10-13
     */
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
    // A wall-clock timeout through the response body. Node's default client
    // only limits socket idle time, so a trickling response can outlive it.
    httpClient: budget
      ? new StripeBudgetHttpClient(
          Stripe.createFetchHttpClient(),
          budget,
          limits.timeoutMs,
        )
      : Stripe.createFetchHttpClient(),
    timeout: limits.timeoutMs,
    // Budgeted clients let the transport own one retry; the SDK and outer
    // wrapper must not add their own backoff. Unbudgeted callers keep the
    // SDK retry policy (ADR-018).
    maxNetworkRetries: budget ? 0 : limits.maxNetworkRetries,
  });
}
