import 'server-only';
import Stripe from 'stripe';
import { STRIPE_API_VERSION } from '@/lib/stripe-api-version';

const STRIPE_REQUEST_TIMEOUT_MS = 3_000;
const STRIPE_MAX_NETWORK_RETRIES = 1;

export function createStripeClient(
  secretKey: string,
  connection: Pick<Stripe.StripeConfig, 'host' | 'port' | 'protocol'> = {},
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
    httpClient: Stripe.createFetchHttpClient(),
    timeout: STRIPE_REQUEST_TIMEOUT_MS,
    // Keep one SDK retry for connection failures, 409s and retry headers.
    // Three adapter attempts allow at most six HTTP attempts plus backoff:
    // 19.8 seconds of configured work. A caller-wide deadline is separate.
    maxNetworkRetries: STRIPE_MAX_NETWORK_RETRIES,
  });
}
